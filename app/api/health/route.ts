import { getStore } from "@/lib/store";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getStore().health();
    return json(200, { status: "ok", store: getStore().kind });
  } catch {
    return json(503, { status: "unavailable" });
  }
}
