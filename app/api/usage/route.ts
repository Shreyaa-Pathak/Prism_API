import { getStore } from "@/lib/store";
import { dashboardRequest } from "@/lib/dashboard-api";
import { json } from "@/lib/http";
import { PLANS } from "@/lib/ratelimit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return dashboardRequest(req, async (identity) => {
    const store = getStore(),
      keys = await store.keys.listByAccount(identity.workspaceId);
    const keyId = new URL(req.url).searchParams.get("keyId");
    const summary = await store.usage.summary(
      identity.workspaceId,
      keyId,
      Date.now() - 24 * 3600000,
    );
    const buckets = await Promise.all(
      keys
        .filter((k) => !k.revokedAt)
        .map(async (k) => ({
          keyId: k.id,
          plan: k.plan,
          ...PLANS[k.plan],
          ...(await store.limits.peek(
            k.id,
            PLANS[k.plan].capacity,
            PLANS[k.plan].refillPerSec,
          )),
        })),
    );
    return json(200, { summary, buckets }, { "cache-control": "no-store" });
  });
}
