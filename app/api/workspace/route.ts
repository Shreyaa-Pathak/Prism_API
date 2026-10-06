import { readJson } from "@/lib/input";
import { dashboardRequest } from "@/lib/dashboard-api";
import { getStore } from "@/lib/store";
import { apiError, json } from "@/lib/http";
import { assertFirst, decode, toConnection } from "@/graphql/pagination";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return dashboardRequest(req, async (identity) => {
    const search = new URL(req.url).searchParams;
    const first = Number(search.get("first") ?? 20);
    let cursor: { id: string } | undefined;
    try {
      assertFirst(first);
      cursor = search.get("after")
        ? { id: decode(search.get("after")!) }
        : undefined;
    } catch {
      return json(
        400,
        apiError("invalid_parameter", "Invalid pagination parameters."),
      );
    }
    const data = getStore().data(identity.workspaceId);
    const projectId = search.get("projectId");
    if (projectId) {
      if (!(await data.project.findManyByIds([projectId])).length)
        return json(404, apiError("not_found", "Project not found."));
      return json(
        200,
        {
          ...toConnection(
            await data.deployment.findMany({
              where: { projectId },
              take: first + 1,
              cursor,
            }),
            first,
          ),
        },
        { "cache-control": "no-store" },
      );
    }
    return json(
      200,
      {
        identity,
        ...toConnection(
          await data.project.findMany({ take: first + 1, cursor }),
          first,
        ),
      },
      { "cache-control": "no-store" },
    );
  });
}
export async function POST(req: Request) {
  return dashboardRequest(req, async (identity) => {
    const body = (await readJson(req).catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
    if (
      !name ||
      name.length > 100 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      slug.length > 100
    )
      return json(
        400,
        apiError(
          "invalid_input",
          "Use a name up to 100 characters and a lowercase slug with letters, numbers, or hyphens.",
        ),
      );
    return json(201, {
      data: await getStore()
        .data(identity.workspaceId)
        .project.create({ name, slug, ownerId: identity.userId }),
    });
  });
}
