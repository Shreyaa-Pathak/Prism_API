import { getStore } from "@/lib/store";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getStore().health();
    return json(200, { status: "ok", store: getStore().kind });
  } catch (e) {
    // The reason goes to server logs only; the public response stays generic.
    console.error("[prism] health check failed", e);
    return json(503, { status: "unavailable" });
  }
}
