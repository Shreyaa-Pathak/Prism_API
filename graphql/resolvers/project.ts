import type { Context, ProjectRow } from "../context";
import { assertFirst, decode, toConnection } from "../pagination";

export const Project = {
  // batched: one query per request, not one per row
  owner: (project: ProjectRow, _args: unknown, { loaders }: Context) =>
    loaders.user.load(project.ownerId),

  deployments: async (
    project: ProjectRow,
    { first = 20, after }: { first?: number; after?: string },
    { loaders }: Context,
  ) => {
    assertFirst(first);
    const rows = await loaders.deployments.load({
      where: { projectId: project.id },
      take: first + 1,
      cursor: after ? { id: decode(after) } : undefined,
    });

    return toConnection(rows, first);
  },
};
