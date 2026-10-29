import { getStore } from "@/lib/store";
import { describeSandbox } from "@/lib/sandbox";
import { apiError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  if (!process.env.PRISM_SANDBOX_KEY)
    return json(404, apiError("sandbox_disabled", "The sandbox is not enabled on this installation. You can use your own workspace key."), headers);
  try {
    const demo = await describeSandbox(getStore(), process.env.PRISM_SANDBOX_KEY);
    return demo
      ? json(200, demo, headers)
      : json(503, apiError("sandbox_unavailable", "The sandbox is not ready. Try again later or use your own key."), headers);
  } catch {
    return json(503, apiError("sandbox_unavailable", "The sandbox is temporarily unavailable."), headers);
  }
}
