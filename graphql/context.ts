import DataLoader from "dataloader";
import type {
  DataDb,
  DeploymentRow,
  FindManyArgs,
  ProjectRow,
  UserRow,
} from "@/lib/store/types";

export interface Context {
  db: DataDb;
  loaders: {
    user: DataLoader<string, UserRow | null>;
    project: DataLoader<string, ProjectRow | null>;
    deployments: DataLoader<
      FindManyArgs & { where: { projectId: string } },
      DeploymentRow[],
      string
    >;
  };
  stats: { dbQueries: number };
}

const byId = <T extends { id: string }>(rows: T[], ids: readonly string[]) => {
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id) ?? null);
};

/** Wraps the data layer so every round trip is counted (reported as x-prism-db-queries). */
function counted(db: DataDb, stats: Context["stats"]): DataDb {
  const tick =
    <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    (...a: A) => (stats.dbQueries++, fn(...a));
  return {
    user: { findManyByIds: tick(db.user.findManyByIds) },
    project: {
      create: tick(db.project.create),
      findManyByIds: tick(db.project.findManyByIds),
      findMany: tick(db.project.findMany),
    },
    deployment: {
      findPages: tick(db.deployment.findPages),
      create: tick(db.deployment.create),
      findById: tick(db.deployment.findById),
      findMany: tick(db.deployment.findMany),
    },
  };
}

/** Fresh loaders per request. `batch: false` exists so the playground can show the N+1 problem. */
export function createContext(data: DataDb, { batch = true } = {}): Context {
  const stats = { dbQueries: 0 };
  const db = counted(data, stats);
  const opts = { batch, cache: batch };
  return {
    db,
    stats,
    loaders: {
      user: new DataLoader(
        async (ids: readonly string[]) =>
          byId(await db.user.findManyByIds(ids), ids),
        opts,
      ),
      project: new DataLoader(
        async (ids: readonly string[]) =>
          byId(await db.project.findManyByIds(ids), ids),
        opts,
      ),
      deployments: new DataLoader(
        async (args) => db.deployment.findPages(args),
        { ...opts, cacheKeyFn: (args) => JSON.stringify(args) },
      ),
    },
  };
}

export type { DeploymentRow, ProjectRow, UserRow };
