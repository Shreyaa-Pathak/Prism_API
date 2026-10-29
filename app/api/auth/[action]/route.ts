import { readJson } from "@/lib/input";
import { randomBytes, createHash } from "node:crypto";
import { getStore } from "@/lib/store";
import {
  endSession,
  getIdentity,
  rememberDevice,
  sessionHash,
  startSession,
  trustedDevice,
} from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { sameOrigin } from "@/lib/dashboard-api";
import { apiError, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const dummyHash = hashPassword(randomBytes(32).toString("hex"));

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if ((await params).action !== "me")
    return json(404, apiError("not_found", "Not found."));
  try {
    return json(
      200,
      { identity: await getIdentity() },
      { "cache-control": "no-store" },
    );
  } catch {
    return json(
      503,
      apiError("unavailable", "Service temporarily unavailable."),
    );
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if (!sameOrigin(req))
    return json(403, apiError("forbidden", "Same-origin request required."));
  const { action } = await params;
  if (!["login", "register", "logout"].includes(action))
    return json(404, apiError("not_found", "Not found."));
  try {
    // Validate configuration before creating records or issuing sessions.
    sessionHash("configuration-check");
    if (action === "logout") {
      await endSession();
      return json(200, { ok: true });
    }
    const body = (await readJson(req).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      password.length < 12 ||
      Buffer.byteLength(password) > 256 ||
      (action === "register" && (!name || name.length > 100))
    ) {
      return json(
        400,
        apiError(
          "invalid_input",
          "Use a valid email, a password of 12–256 bytes, and a name up to 100 characters.",
        ),
      );
    }
    const store = getStore();
    // A per-email throttle survives restarts. A shared throttle bounds new-account abuse
    // without trusting spoofable forwarding/IP headers from an unknown proxy. A browser
    // that previously signed in to this account is throttled on its own, so neither
    // bucket can be drained by someone else to lock the owner out.
    const id = createHash("sha256").update(email).digest("hex");
    const device = action === "login" ? await trustedDevice(email) : null;
    if (!device) {
      const globalLimit = await store.limits.take("auth:global", 100, 1);
      if (!globalLimit.allowed)
        return json(
          429,
          apiError("rate_limited", "Too many attempts. Try again later."),
          { "retry-after": String(globalLimit.retryAfter) },
        );
    }
    const limit = await store.limits.take(
      device ? `auth:device:${device}` : `auth:${id}`,
      5,
      1 / 60,
    );
    if (!limit.allowed)
      return json(
        429,
        apiError("rate_limited", "Too many attempts. Try again later."),
        { "retry-after": String(limit.retryAfter) },
      );
    if (action === "register") {
      const identity = await store.identity.register(
        name,
        email,
        await hashPassword(password),
      );
      await startSession(identity.userId);
      await rememberDevice(email);
      return json(201, { identity }, { "cache-control": "no-store" });
    }
    const user = await store.identity.credentials(email);
    const valid = await verifyPassword(
      password,
      user?.passwordHash ?? (await dummyHash),
    );
    if (!user || !valid)
      return json(
        401,
        apiError("invalid_credentials", "Email or password is incorrect."),
      );
    await startSession(user.id);
    await rememberDevice(email);
    return json(
      200,
      { identity: await getIdentity() },
      { "cache-control": "no-store" },
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      return json(
        409,
        apiError(
          "registration_failed",
          "Unable to register with those details. Try signing in.",
        ),
      );
    console.error("[prism] authentication failed", e);
    return json(
      503,
      apiError("unavailable", "Service temporarily unavailable."),
    );
  }
}
