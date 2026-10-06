import { readJson } from "@/lib/input";
import { getStore } from "@/lib/store";
import { newKey } from "@/lib/keys";
import { dashboardRequest } from "@/lib/dashboard-api";
import { apiError, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return dashboardRequest(req, async (identity) =>
    json(
      200,
      { keys: await getStore().keys.listByAccount(identity.workspaceId) },
      { "cache-control": "no-store" },
    ),
  );
}
export async function POST(req: Request) {
  return dashboardRequest(req, async (identity) => {
    const body = (await readJson(req).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const plan = body?.plan ?? "standard";
    if (
      !name ||
      name.length > 60 ||
      (plan !== "standard" && plan !== "sandbox")
    )
      return json(
        400,
        apiError(
          "invalid_input",
          "Give the key a name of 1-60 characters and a valid plan.",
        ),
      );
    const { record, secret } = newKey(identity.workspaceId, name, plan);
    await getStore().keys.insert(record);
    const { hash: _, ...key } = record;
    return json(201, { key, secret }, { "cache-control": "no-store" });
  });
}
