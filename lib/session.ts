import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getStore } from "./store";
const COOKIE = "prism_session";
export function sessionHash(token: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || /[<>]/.test(secret))
    throw new Error(
      "SESSION_SECRET must contain at least 32 characters and cannot be a placeholder.",
    );
  return createHmac("sha256", secret).update(token).digest("hex");
}
export async function getIdentity() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  return getStore().identity.session(sessionHash(raw));
}
export async function getAccountId(_create = false): Promise<string | null> {
  return (await getIdentity())?.workspaceId ?? null;
}
export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  await getStore().identity.createSession(
    userId,
    sessionHash(token),
    expiresAt,
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
const DEVICE = "prism_device";
const deviceMac = (email: string, nonce: string) =>
  sessionHash(`device:${email}:${nonce}`);
/**
 * A browser that already signed in to this account. Its attempts use their own throttle,
 * so failed guesses by someone else cannot lock the owner out (OWASP device cookies).
 */
export async function trustedDevice(email: string): Promise<string | null> {
  const [nonce, mac] = ((await cookies()).get(DEVICE)?.value ?? "").split(".");
  if (!/^[a-f0-9]{32}$/.test(nonce ?? "") || !/^[a-f0-9]{64}$/.test(mac ?? ""))
    return null;
  return timingSafeEqual(
    Buffer.from(deviceMac(email, nonce), "hex"),
    Buffer.from(mac, "hex"),
  )
    ? nonce
    : null;
}
export async function rememberDevice(email: string) {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(DEVICE, `${nonce}.${deviceMac(email, nonce)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 180 * 86_400,
  });
}
export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await getStore().identity.revokeSession(sessionHash(token));
  jar.delete(COOKIE);
}
