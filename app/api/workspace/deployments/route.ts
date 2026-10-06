import { readJson } from "@/lib/input";
import { dashboardRequest } from "@/lib/dashboard-api";
import { getStore } from "@/lib/store";
import { apiError, json } from "@/lib/http";
import type { DeploymentStatus } from "@/lib/store/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return dashboardRequest(req, async (identity) => {
    const b = (await readJson(req).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (
      !b ||
      typeof b.projectId !== "string" ||
      b.projectId.length > 100 ||
      typeof b.status !== "string" ||
      !["QUEUED", "BUILDING", "READY", "FAILED"].includes(b.status) ||
      typeof b.branch !== "string" ||
      !b.branch.trim() ||
      b.branch.length > 200 ||
      typeof b.commit !== "string" ||
      !b.commit.trim() ||
      b.commit.length > 100
    )
      return json(
        400,
        apiError(
          "invalid_input",
          "Provide a project, valid status, branch, and commit.",
        ),
      );
    const deployment = await getStore()
      .data(identity.workspaceId)
      .deployment.create({
        projectId: b.projectId,
        status: b.status as DeploymentStatus,
        branch: b.branch.trim(),
        commit: b.commit.trim(),
      });
    if (!deployment)
      return json(404, apiError("not_found", "Project not found."));
    return json(201, { data: deployment });
  });
}
