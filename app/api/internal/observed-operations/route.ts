import { getStore } from "@/lib/store";
import { timingSafeEqual } from "node:crypto";
import { apiError, json } from "@/lib/http";
import { WINDOW_DAYS } from "@/graphql/schemaCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feeds `npm run schema:check` in CI. Disabled unless ADMIN_TOKEN is configured. */
export async function GET(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 32 || /[<>]/.test(token))
    return json(404, apiError("not_found", "Not found."));
  const provided = Buffer.from(req.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${token}`);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return json(401, apiError("unauthorized", "Admin token required."));
  const days = Math.min(
    90,
    Number(new URL(req.url).searchParams.get("days") ?? WINDOW_DAYS) ||
      WINDOW_DAYS,
  );
  try {
    return json(
      200,
      {
        operations: await getStore().operations.list(
          Date.now() - Math.max(1, days) * 86_400_000,
        ),
      },
      { "cache-control": "no-store" },
    );
  } catch {
    return json(
      503,
      apiError("unavailable", "Service temporarily unavailable."),
    );
  }
}
