export interface UserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}
export type DeploymentStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";
export interface DeploymentRow {
  id: string;
  projectId: string;
  status: DeploymentStatus;
  branch: string;
  commit: string;
  createdAt: string;
}

/** Cursor is exclusive: rows strictly after the cursor row, in newest-first order. */
export interface FindManyArgs {
  take: number;
  cursor?: { id: string };
}

/** The data the dashboard already owned. Prisma-flavoured so resolvers read naturally. */
export interface DataDb {
  user: { findManyByIds(ids: readonly string[]): Promise<UserRow[]> };
  project: {
    create(input: {
      name: string;
      slug: string;
      ownerId: string;
    }): Promise<ProjectRow>;
    findManyByIds(ids: readonly string[]): Promise<ProjectRow[]>;
    findMany(args: FindManyArgs): Promise<ProjectRow[]>;
  };
  deployment: {
    findPages(
      args: readonly (FindManyArgs & { where: { projectId: string } })[],
    ): Promise<DeploymentRow[][]>;
    create(input: {
      projectId: string;
      status: DeploymentStatus;
      branch: string;
      commit: string;
    }): Promise<DeploymentRow | null>;
    findById(id: string): Promise<DeploymentRow | null>;
    findMany(
      args: FindManyArgs & { where: { projectId: string } },
    ): Promise<DeploymentRow[]>;
  };
}

export type Plan = "sandbox" | "standard";

export interface ApiKey {
  id: string;
  accountId: string;
  name: string;
  prefix: string;
  plan: Plan;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface StoredKey extends ApiKey {
  hash: string;
}

export interface UsageEvent {
  keyId: string;
  workspaceId: string;
  at: number;
  route: string;
  status: number;
  latencyMs: number;
}

export interface UsageSummary {
  total: number;
  ok: number;
  limited: number;
  errors: number;
  p50: number | null;
  p99: number | null;
  averageMs: number | null;
  byKey: { keyId: string; count: number }[];
  hourly: { hour: string; ok: number; limited: number; errors: number }[];
  routes: { route: string; count: number }[];
}

export interface ObservedOperation {
  hash: string;
  document: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
}

export interface PlatformStore {
  kind: "postgres";
  data(workspaceId: string): DataDb;
  health(): Promise<void>;
  close(): Promise<void>;
  sandbox: {
    workspaceForKey(hash: string): Promise<string | null>;
  };
  identity: {
    register(
      name: string,
      email: string,
      passwordHash: string,
    ): Promise<Identity>;
    credentials(
      email: string,
    ): Promise<{ id: string; passwordHash: string } | null>;
    createSession(userId: string, hash: string, expiresAt: Date): Promise<void>;
    session(hash: string): Promise<Identity | null>;
    revokeSession(hash: string): Promise<void>;
  };
  limits: {
    take(
      id: string,
      capacity: number,
      refillPerSec: number,
    ): Promise<import("../ratelimit").LimitResult>;
    peek(
      id: string,
      capacity: number,
      refillPerSec: number,
    ): Promise<import("../ratelimit").LimitResult>;
  };
  keys: {
    insert(key: StoredKey): Promise<void>;
    findByHash(hash: string): Promise<StoredKey | null>;
    listByAccount(accountId: string): Promise<ApiKey[]>;
    revoke(accountId: string, id: string): Promise<boolean>;
    touch(id: string, at: string): Promise<void>;
  };
  usage: {
    record(event: UsageEvent): Promise<void>;
    summary(
      workspaceId: string,
      keyId: string | null,
      since: number,
    ): Promise<UsageSummary>;
  };
  operations: {
    record(hash: string, document: string, at: number): Promise<void>;
    list(since: number): Promise<ObservedOperation[]>;
  };
}

export interface Identity {
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  workspaceName: string;
}
