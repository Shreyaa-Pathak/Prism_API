import { getStore } from "@/lib/store";
import { dashboardRequest } from "@/lib/dashboard-api";
import { apiError, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return dashboardRequest(req, async (identity) => {
    const { id } = await params;
    if (!(await getStore().keys.revoke(identity.workspaceId, id)))
      return json(
        404,
        apiError("not_found", "No active key with that id in your workspace."),
      );
    return json(200, { revoked: id });
  });
}
