import type { Context, DeploymentRow } from "../context";
import { assertFirst, decode, toConnection } from "../pagination";
import { Project } from "./project";

export const resolvers = {
  Query: {
    project: (_: unknown, { id }: { id: string }, { loaders }: Context) => loaders.project.load(id),
    user: (_: unknown, { id }: { id: string }, { loaders }: Context) => loaders.user.load(id),
    deployment: (_: unknown, { id }: { id: string }, { db }: Context) => db.deployment.findById(id),
    projects: async (_: unknown, { first = 20, after }: { first?: number; after?: string }, { db }: Context) => {
      assertFirst(first);
      const rows = await db.project.findMany({ take: first + 1, cursor: after ? { id: decode(after) } : undefined });
      return toConnection(rows, first);
    },
  },
  Project,
  Deployment: {
    project: (d: DeploymentRow, _: unknown, { loaders }: Context) => loaders.project.load(d.projectId),
  },
};
