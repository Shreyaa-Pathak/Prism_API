import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { bucketResult } from "../ratelimit";
import type {
  ApiKey,
  DataDb,
  DeploymentRow,
  Identity,
  PlatformStore,
  ProjectRow,
  StoredKey,
  UserRow,
  UsageSummary,
} from "./types";
const iso = (v: Date | string | null) =>
  v === null ? null : new Date(v).toISOString();
type Row = Record<string, unknown>;
const toUser = (r: Row): UserRow => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  createdAt: iso(r.created_at as Date)!,
});
const toProject = (r: Row): ProjectRow => ({
  id: r.id as string,
  name: r.name as string,
  slug: r.slug as string,
  ownerId: r.owner_id as string,
  createdAt: iso(r.created_at as Date)!,
});
const toDeployment = (r: Row): DeploymentRow => ({
  id: r.id as string,
  projectId: r.project_id as string,
  status: r.status as DeploymentRow["status"],
  branch: r.branch as string,
  commit: r.commit_sha as string,
  createdAt: iso(r.created_at as Date)!,
});
const toKey = (r: Row): StoredKey => ({
  id: r.id as string,
  accountId: r.workspace_id as string,
  name: r.name as string,
  prefix: r.prefix as string,
  hash: r.hash as string,
  plan: r.plan as StoredKey["plan"],
  createdAt: iso(r.created_at as Date)!,
  lastUsedAt: iso(r.last_used_at as Date | null),
  revokedAt: iso(r.revoked_at as Date | null),
});

export function createPostgresStore(connectionString: string): PlatformStore {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  pool.on("error", (error) =>
    console.error("[prism] idle database connection failed", error.message),
  );
  const q = async (sql: string, params: unknown[] = []) =>
    (await pool.query(sql, params)).rows as Row[];
  const transaction = async <T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  };
  // The workspace is bound once from trusted identity, never supplied by a query argument.
  const data = (workspaceId: string): DataDb => {
    if (!workspaceId) throw new Error("Authenticated workspace required.");
    return {
      user: {
        findManyByIds: async (ids) =>
          (
            await q(
              `select u.* from users u join workspace_members m on m.user_id=u.id where m.workspace_id=$1 and u.id=any($2::text[])`,
              [workspaceId, ids],
            )
          ).map(toUser),
      },
      project: {
        create: async (input) => {
          const [r] = await q(
            `insert into projects(id,workspace_id,name,slug,owner_id) values($1,$2,$3,$4,$5) returning *`,
            [
              `prj_${randomUUID()}`,
              workspaceId,
              input.name,
              input.slug,
              input.ownerId,
            ],
          );
          return toProject(r);
        },
        findManyByIds: async (ids) =>
          (
            await q(
              "select * from projects where workspace_id=$1 and id=any($2::text[])",
              [workspaceId, ids],
            )
          ).map(toProject),
        findMany: async ({ take, cursor }) =>
          (
            await q(
              `select * from projects where workspace_id=$1
          and ($2::text is null or (created_at,id) < (select created_at,id from projects where workspace_id=$1 and id=$2))
          order by created_at desc,id desc limit $3`,
              [workspaceId, cursor?.id ?? null, take],
            )
          ).map(toProject),
      },
      deployment: {
        findPages: async (args) => {
          const requests = args.map((a, i) => ({
            i,
            project_id: a.where.projectId,
            take: a.take,
            cursor_id: a.cursor?.id ?? null,
          }));
          const rows = await q(
            `select r.i,d.* from jsonb_to_recordset($2::jsonb) as r(i int,project_id text,take int,cursor_id text)
            cross join lateral (select * from deployments where workspace_id=$1 and project_id=r.project_id
              and (r.cursor_id is null or (created_at,id)<(select created_at,id from deployments where workspace_id=$1 and project_id=r.project_id and id=r.cursor_id))
              order by created_at desc,id desc limit r.take) d order by r.i,d.created_at desc,d.id desc`,
            [workspaceId, JSON.stringify(requests)],
          );
          const pages: DeploymentRow[][] = args.map(() => []);
          for (const r of rows) pages[Number(r.i)].push(toDeployment(r));
          return pages;
        },
        create: async (input) => {
          const [r] = await q(
            `insert into deployments(id,workspace_id,project_id,status,branch,commit_sha)
            select $1,$2,id,$4,$5,$6 from projects where workspace_id=$2 and id=$3 returning *`,
            [
              `dep_${randomUUID()}`,
              workspaceId,
              input.projectId,
              input.status,
              input.branch,
              input.commit,
            ],
          );
          return r ? toDeployment(r) : null;
        },
        findById: async (id) => {
          const [r] = await q(
            "select * from deployments where workspace_id=$1 and id=$2",
            [workspaceId, id],
          );
          return r ? toDeployment(r) : null;
        },
        findMany: async ({ where, take, cursor }) =>
          (
            await q(
              `select * from deployments where workspace_id=$1 and project_id=$2
          and ($3::text is null or (created_at,id) < (select created_at,id from deployments where workspace_id=$1 and project_id=$2 and id=$3))
          order by created_at desc,id desc limit $4`,
              [workspaceId, where.projectId, cursor?.id ?? null, take],
            )
          ).map(toDeployment),
      },
    };
  };
  const identity = (r: Row): Identity => ({
    userId: r.user_id as string,
    workspaceId: r.workspace_id as string,
    name: r.name as string,
    email: r.email as string,
    workspaceName: r.workspace_name as string,
  });
  return {
    kind: "postgres",
    data,
    health: async () => {
      await q("select id from workspaces limit 1");
    },
    close: () => pool.end(),
    identity: {
      register: (name, email, passwordHash) =>
        transaction(async (client) => {
          const userId = `usr_${randomUUID()}`,
            workspaceId = `wsp_${randomUUID()}`,
            workspaceName = `${name}'s workspace`;
          await client.query(
            "insert into users(id,name,email,password_hash) values($1,$2,$3,$4)",
            [userId, name, email, passwordHash],
          );
          await client.query("insert into workspaces(id,name) values($1,$2)", [
            workspaceId,
            workspaceName,
          ]);
          await client.query(
            "insert into workspace_members(workspace_id,user_id) values($1,$2)",
            [workspaceId, userId],
          );
          return { userId, workspaceId, name, email, workspaceName };
        }),
      credentials: async (email) => {
        const [r] = await q(
          "select id,password_hash from users where email=$1",
          [email],
        );
        return r
          ? { id: r.id as string, passwordHash: r.password_hash as string }
          : null;
      },
      createSession: async (userId, hash, expiresAt) => {
        const rows = await q(
          `insert into sessions(hash,user_id,workspace_id,expires_at)
          select $1,user_id,workspace_id,$3 from workspace_members where user_id=$2 order by created_at,workspace_id limit 1 returning hash`,
          [hash, userId, expiresAt],
        );
        if (!rows.length) throw new Error("User has no workspace.");
      },
      session: async (hash) => {
        const [r] = await q(
          `select s.user_id,s.workspace_id,u.name,u.email,w.name as workspace_name from sessions s
          join users u on u.id=s.user_id join workspaces w on w.id=s.workspace_id
          join workspace_members m on m.user_id=s.user_id and m.workspace_id=s.workspace_id
          where s.hash=$1 and s.expires_at>now()`,
          [hash],
        );
        return r ? identity(r) : null;
      },
      revokeSession: async (hash) => {
        await q("delete from sessions where hash=$1", [hash]);
      },
    },
    keys: {
      insert: (k) =>
        transaction(async (client) => {
          // Serialize creation per workspace to enforce the key cap even during concurrent requests.
          await client.query(
            "select id from workspaces where id=$1 for update",
            [k.accountId],
          );
          const count = await client.query(
            "select count(*)::int as n from api_keys where workspace_id=$1 and revoked_at is null",
            [k.accountId],
          );
          if (count.rows[0].n >= 5)
            throw Object.assign(new Error("Active key limit reached."), {
              code: "KEY_LIMIT",
            });
          await client.query(
            `insert into api_keys(id,workspace_id,name,prefix,hash,plan,created_at) values($1,$2,$3,$4,$5,$6,$7)`,
            [k.id, k.accountId, k.name, k.prefix, k.hash, k.plan, k.createdAt],
          );
        }),
      findByHash: async (hash) => {
        const [r] = await q("select * from api_keys where hash=$1", [hash]);
        return r ? toKey(r) : null;
      },
      listByAccount: async (id) =>
        (
          await q(
            "select * from api_keys where workspace_id=$1 order by created_at desc",
            [id],
          )
        ).map((r) => {
          const { hash: _, ...key } = toKey(r);
          return key as ApiKey;
        }),
      revoke: async (workspaceId, id) =>
        (
          await pool.query(
            "update api_keys set revoked_at=now() where workspace_id=$1 and id=$2 and revoked_at is null",
            [workspaceId, id],
          )
        ).rowCount === 1,
      touch: async (id, at) => {
        await q("update api_keys set last_used_at=$2 where id=$1", [id, at]);
      },
    },
    limits: {
      take: (id, capacity, refill) =>
        transaction(async (client) => {
          await client.query(
            "insert into rate_buckets(id,tokens) values($1,$2) on conflict(id) do nothing",
            [id, capacity],
          );
          const locked = await client.query(
            "select tokens,updated_at from rate_buckets where id=$1 for update",
            [id],
          );
          // Read database time AFTER acquiring the row lock; process clocks cannot skew the bucket.
          const time = await client.query("select clock_timestamp() as now");
          const now = time.rows[0].now as Date;
          const r = locked.rows[0];
          const available = Math.min(
            capacity,
            Number(r.tokens) +
              (Math.max(0, now.getTime() - new Date(r.updated_at).getTime()) /
                1000) *
                refill,
          );
          const allowed = available >= 1,
            tokens = allowed ? available - 1 : available;
          await client.query(
            "update rate_buckets set tokens=$2,updated_at=$3 where id=$1",
            [id, tokens, now],
          );
          return bucketResult(tokens, capacity, refill, allowed);
        }),
      peek: async (id, capacity, refill) => {
        const [r] = await q(
          "select least($2,tokens+greatest(0,extract(epoch from clock_timestamp()-updated_at))*$3) as tokens from rate_buckets where id=$1",
          [id, capacity, refill],
        );
        return bucketResult(
          r ? Number(r.tokens) : capacity,
          capacity,
          refill,
          true,
        );
      },
    },
    usage: {
      record: async (e) => {
        await q(
          "insert into usage_events(workspace_id,key_id,at,route,status,latency_ms) values($1,$2,to_timestamp($3/1000.0),$4,$5,$6)",
          [e.workspaceId, e.keyId, e.at, e.route, e.status, e.latencyMs],
        );
      },
      summary: async (workspaceId, keyId, since) => {
        const where =
          "workspace_id=$1 and ($2::text is null or key_id=$2) and at>=to_timestamp($3/1000.0)";
        const params = [workspaceId, keyId, since];
        const [totals, hours, routes, byKey] = await Promise.all([
          q(
            `select count(*) as total,count(*) filter(where status<400) as ok,count(*) filter(where status=429) as limited,
            count(*) filter(where status>=400 and status<>429) as errors,
            avg(latency_ms) filter(where status<>429) as average,
            percentile_cont(0.5) within group(order by latency_ms) filter(where status<>429) as p50,
            percentile_cont(0.99) within group(order by latency_ms) filter(where status<>429) as p99 from usage_events where ${where}`,
            params,
          ),
          q(
            `select date_trunc('hour',at) as hour,count(*) filter(where status<400) as ok,count(*) filter(where status=429) as limited,count(*) filter(where status>=400 and status<>429) as errors from usage_events where ${where} group by 1 order by 1`,
            params,
          ),
          q(
            `select route,count(*) as count from usage_events where ${where} group by route order by count desc limit 6`,
            params,
          ),
          q(
            `select key_id,count(*) as count from usage_events where ${where} group by key_id order by count desc`,
            params,
          ),
        ]);
        const r = totals[0],
          round = (v: unknown) =>
            v == null ? null : Math.round(Number(v) * 10) / 10;
        const end = Math.floor(Date.now() / 3600000) * 3600000;
        const hourly = Array.from({ length: 24 }, (_, i) => ({
          hour: new Date(end - (23 - i) * 3600000).toISOString(),
          ok: 0,
          limited: 0,
          errors: 0,
        }));
        for (const h of hours) {
          const target = hourly.find((x) => x.hour === iso(h.hour as Date));
          if (target)
            Object.assign(target, {
              ok: Number(h.ok),
              limited: Number(h.limited),
              errors: Number(h.errors),
            });
        }
        return {
          total: Number(r.total),
          ok: Number(r.ok),
          limited: Number(r.limited),
          errors: Number(r.errors),
          averageMs: round(r.average),
          p50: round(r.p50),
          p99: round(r.p99),
          hourly,
          routes: routes.map((r) => ({
            route: r.route as string,
            count: Number(r.count),
          })),
          byKey: byKey.map((r) => ({
            keyId: r.key_id as string,
            count: Number(r.count),
          })),
        } satisfies UsageSummary;
      },
    },
    operations: {
      record: async (hash, document, at) => {
        await q(
          `insert into observed_operations(hash,document,first_seen,last_seen,count) values($1,$2,to_timestamp($3/1000.0),to_timestamp($3/1000.0),1) on conflict(hash) do update set last_seen=excluded.last_seen,count=observed_operations.count+1`,
          [hash, document, at],
        );
      },
      list: async (since) =>
        (
          await q(
            "select * from observed_operations where last_seen>=to_timestamp($1/1000.0)",
            [since],
          )
        ).map((r) => ({
          hash: r.hash as string,
          document: r.document as string,
          firstSeen: new Date(r.first_seen as Date).getTime(),
          lastSeen: new Date(r.last_seen as Date).getTime(),
          count: Number(r.count),
        })),
    },
  };
}
