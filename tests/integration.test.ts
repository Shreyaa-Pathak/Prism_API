import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, sep } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, test } from "node:test";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { migrate } from "../scripts/migrate";
import { createPostgresStore } from "../lib/store/postgres";
import { hashPassword, verifyPassword } from "../lib/password";
import { newKey } from "../lib/keys";
import type {
  Identity,
  PlatformStore,
  ProjectRow,
  DeploymentRow,
} from "../lib/store/types";
import { Prism } from "../sdk/prism";
import { generateSdk } from "../graphql/sdkgen";
import { sessionHash } from "../lib/session";
import { provisionSandbox } from "../scripts/provision-sandbox";
import { describeSandbox } from "../lib/sandbox";

let pg: EmbeddedPostgres | undefined,
  pool: Pool,
  store: PlatformStore,
  server: ChildProcess | undefined;
let databaseDir = "",
  url = "",
  origin = "",
  logs = "";
let a: Identity,
  b: Identity,
  pa: ProjectRow,
  pb: ProjectRow,
  da: DeploymentRow,
  db: DeploymentRow;
let keyA: string,
  keyB: string,
  keyIdA: string,
  cookieA: string,
  cookieB: string;
const password = randomBytes(24).toString("hex");
const sessionSecret = randomBytes(32).toString("hex");
const sandboxKey = `prism_sandbox_${randomBytes(24).toString("hex")}`;
async function freePort() {
  const s = createServer();
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
async function request(
  path: string,
  options: {
    cookie?: string;
    key?: string;
    method?: string;
    body?: unknown;
    origin?: string;
  } = {},
) {
  return fetch(origin + path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.key ? { authorization: `Bearer ${options.key}` } : {}),
      ...(options.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(options.method && options.method !== "GET"
        ? { origin: options.origin ?? origin }
        : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}
async function gql(
  key: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await request("/graphql", {
    key,
    method: "POST",
    body: { query, variables },
  });
  assert.equal(res.status, 200);
  return res.json();
}
async function startServer() {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      new URL(origin).port,
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: url,
        SESSION_SECRET: sessionSecret,
        PRISM_PUBLIC_URL: origin,
        ADMIN_TOKEN: randomBytes(32).toString("hex"),
        PRISM_SANDBOX_KEY: sandboxKey,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  server.stderr?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    if (server.exitCode !== null)
      throw new Error("Test HTTP server stopped before becoming ready.");
    try {
      const res = await request("/api/health");
      if (res.status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(
    (await request("/api/health")).status,
    200,
    "HTTP server did not become healthy",
  );
}
async function stopServer() {
  if (server && server.exitCode === null) {
    if (process.platform === "win32") {
      const stop = spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      await once(stop, "exit");
    } else {
      server.kill("SIGTERM");
      await once(server, "exit");
    }
  }
}
before(
  async () => {
    const pgPort = await freePort(),
      appPort = await freePort();
    await mkdir(".test-postgres", { recursive: true });
    databaseDir = await mkdtemp(resolve(".test-postgres/run-"));
    pg = new EmbeddedPostgres({
      databaseDir,
      user: "prism_test",
      password,
      port: pgPort,
      persistent: true,
      authMethod: "scram-sha-256",
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("prism_test");
    url = `postgresql://prism_test:${password}@127.0.0.1:${pgPort}/prism_test`;
    pool = new Pool({ connectionString: url });
    await migrate(pool);
    await pool.query("alter table prism_migrations rename to previous_migrations");
    await migrate(pool);
    assert.ok((await pool.query("select to_regclass('prism_migrations') as ledger")).rows[0].ledger);
    assert.equal((await pool.query("select to_regclass('previous_migrations') as ledger")).rows[0].ledger, null);
    store = createPostgresStore(url);
    await provisionSandbox(pool, sandboxKey);
    await provisionSandbox(pool, sandboxKey);
    origin = `http://127.0.0.1:${appPort}`;
    await startServer();
    for (const suffix of ["a", "b"]) {
      const res = await request("/api/auth/register", {
        method: "POST",
        body: {
          name: `Persona ${suffix}`,
          email: `${suffix}@example.test`,
          password,
        },
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      const cookie = res.headers.get("set-cookie")!.split(";")[0];
      if (suffix === "a") {
        a = body.identity;
        cookieA = cookie;
      } else {
        b = body.identity;
        cookieB = cookie;
      }
    }
    for (const [identity, cookie] of [
      [a, cookieA],
      [b, cookieB],
    ] as const) {
      const res = await request("/api/workspace", {
        cookie,
        method: "POST",
        body: {
          name: "Private project",
          slug: "same-slug",
          workspaceId: identity === a ? b.workspaceId : a.workspaceId,
          ownerId: identity === a ? b.userId : a.userId,
        },
      });
      assert.equal(res.status, 201);
      const p = (await res.json()).data;
      const deployment = await request("/api/workspace/deployments", {
        cookie,
        method: "POST",
        body: {
          projectId: p.id,
          status: "READY",
          branch: "main",
          commit: "abc123",
        },
      });
      assert.equal(deployment.status, 201);
      const d = (await deployment.json()).data;
      const k = await request("/api/keys", {
        cookie,
        method: "POST",
        body: { name: "Integration key" },
      });
      assert.equal(k.status, 201);
      const key = await k.json();
      if (identity === a) {
        pa = p;
        da = d;
        keyA = key.secret;
        keyIdA = key.key.id;
      } else {
        pb = p;
        db = d;
        keyB = key.secret;
      }
    }
  },
  { timeout: 120000 },
);

after(
  async () => {
    await stopServer();
    if (store) await store.close();
    if (pool) await pool.end();
    if (pg) await pg.stop();
    // Only remove the disposable cluster created by THIS run, inside the test root.
    if (
      databaseDir &&
      resolve(databaseDir).startsWith(resolve(".test-postgres") + sep)
    )
      await rm(databaseDir, { recursive: true, force: true });
  },
  { timeout: 30000 },
);

test("password hashes are salted and verify without plaintext storage", async () => {
  const first = await hashPassword(password),
    second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(!first.includes(password));
  assert(await verifyPassword(password, first));
  assert(!(await verifyPassword("wrong password", first)));
});
test("sessions fail closed with missing or placeholder secrets", () => {
  const previous = process.env.SESSION_SECRET;
  try {
    delete process.env.SESSION_SECRET;
    assert.throws(() => sessionHash("token"));
    process.env.SESSION_SECRET = "<random-secret-at-least-32-characters>";
    assert.throws(() => sessionHash("token"));
    process.env.SESSION_SECRET = sessionSecret;
    assert.equal(sessionHash("token").length, 64);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
test("dashboard requires a server-side session; old account cookies grant no access", async () => {
  for (const path of ["/api/keys", "/api/usage", "/api/workspace"])
    assert.equal((await request(path)).status, 401);
  assert.equal(
    (
      await request("/api/workspace", {
        cookie: "prism_account=acct_demo.signature",
      })
    ).status,
    401,
  );
});
test("valid, missing, invalid and former sandbox API keys", async () => {
  assert.equal((await request("/v1/projects", { key: keyA })).status, 200);
  assert.equal((await request("/v1/projects")).status, 401);
  assert.equal((await request("/v1/projects", { key: "invalid" })).status, 401);
  assert.equal(
    (await request("/v1/projects", { key: "atl_sandbox_8f2a4c9e1b7d4a61" }))
      .status,
    401,
  );
});
test("REST lists and individual lookups are isolated in both directions", async () => {
  for (const [key, own, other] of [
    [keyA, pa, pb],
    [keyB, pb, pa],
  ] as const) {
    const list = await (
      await request("/v1/projects?include=owner", { key })
    ).json();
    assert.deepEqual(
      list.data.map((p: ProjectRow) => p.id),
      [own.id],
    );
    assert.equal(
      (await request(`/v1/projects/${own.id}`, { key })).status,
      200,
    );
    assert.equal(
      (await request(`/v1/projects/${other.id}`, { key })).status,
      404,
    );
  }
});
test("GraphQL direct, aliased and fragment queries cannot cross workspace boundaries", async () => {
  for (const [key, own, other, otherUser, otherDeployment] of [
    [keyA, pa, pb, b.userId, db.id],
    [keyB, pb, pa, a.userId, da.id],
  ] as const) {
    const body = await gql(
      key,
      `query($own:ID!,$other:ID!,$user:ID!,$deployment:ID!){mine:project(id:$own){...P} theirs:project(id:$other){...P} user(id:$user){email} deployment(id:$deployment){id}} fragment P on Project{id owner{id email} deployments{edges{node{id}}}}`,
      {
        own: own.id,
        other: other.id,
        user: otherUser,
        deployment: otherDeployment,
      },
    );
    assert.equal(body.data.mine.id, own.id);
    assert.equal(body.data.theirs, null);
    assert.equal(body.data.user, null);
    assert.equal(body.data.deployment, null);
  }
});
test("nested deployments and direct deployment REST reads obey the same scope", async () => {
  for (const [key, own, other, ownD, otherD] of [
    [keyA, pa, pb, da, db],
    [keyB, pb, pa, db, da],
  ] as const) {
    const list = await (
      await request(`/v1/projects/${own.id}/deployments`, { key })
    ).json();
    assert.deepEqual(
      list.data.map((d: DeploymentRow) => d.id),
      [ownD.id],
    );
    assert.equal(
      (await request(`/v1/projects/${other.id}/deployments`, { key })).status,
      404,
    );
    assert.equal(
      (await request(`/v1/deployments/${otherD.id}`, { key })).status,
      404,
    );
  }
});
test("dashboard cannot read, write, revoke or select usage belonging to another workspace", async () => {
  const projects = await (
    await request("/api/workspace", { cookie: cookieA })
  ).json();
  assert.deepEqual(
    projects.edges.map((e: { node: ProjectRow }) => e.node.id),
    [pa.id],
  );
  assert.equal(pa.ownerId, a.userId);
  assert.equal(
    (await request(`/api/workspace?projectId=${pb.id}`, { cookie: cookieA }))
      .status,
    404,
  );
  assert.equal(
    (
      await request("/api/workspace/deployments", {
        cookie: cookieA,
        method: "POST",
        body: {
          projectId: pb.id,
          status: "READY",
          branch: "main",
          commit: "attack",
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/keys/${keyIdA}`, {
        cookie: cookieB,
        method: "DELETE",
      })
    ).status,
    404,
  );
  const usage = await (
    await request(`/api/usage?keyId=${keyIdA}`, { cookie: cookieB })
  ).json();
  assert.equal(usage.summary.total, 0);
  const keys = await (await request("/api/keys", { cookie: cookieB })).json();
  assert(
    keys.keys.every(
      (k: { accountId: string; hash?: string; secret?: string }) =>
        k.accountId === b.workspaceId && !k.hash && !k.secret,
    ),
  );
});
test("project ownership constraints also reject cross-workspace writes at the database level", async () => {
  await assert.rejects(
    () =>
      store
        .data(a.workspaceId)
        .project.create({ name: "Attack", slug: "attack", ownerId: b.userId }),
    (e) => (e as { code: string }).code === "23503",
  );
  assert.equal(
    await store.data(a.workspaceId).deployment.create({
      projectId: pb.id,
      status: "READY",
      branch: "main",
      commit: "attack",
    }),
    null,
  );
});
test("cursor pagination is stable and foreign project/deployment cursors yield no records", async () => {
  await store
    .data(a.workspaceId)
    .project.create({ name: "Second", slug: "second", ownerId: a.userId });
  const first = await (
    await request("/v1/projects?first=1", { key: keyA })
  ).json();
  assert.equal(first.data.length, 1);
  assert.equal(first.pageInfo.hasNextPage, true);
  const next = await (
    await request(`/v1/projects?first=1&after=${first.pageInfo.endCursor}`, {
      key: keyA,
    })
  ).json();
  assert.equal(next.data.length, 1);
  assert.notEqual(first.data[0].id, next.data[0].id);
  assert.equal(next.pageInfo.hasNextPage, false);
  const foreign = Buffer.from(`c:${pb.id}`).toString("base64url");
  const rest = await (
    await request(`/v1/projects?after=${foreign}`, { key: keyA })
  ).json();
  assert.deepEqual(rest.data, []);
  const body = await gql(
    keyA,
    "query($after:String){projects(after:$after){edges{node{id}}}}",
    { after: foreign },
  );
  assert.deepEqual(body.data.projects.edges, []);
  const foreignD = Buffer.from(`c:${db.id}`).toString("base64url");
  const deployments = await (
    await request(`/v1/projects/${pa.id}/deployments?after=${foreignD}`, {
      key: keyA,
    })
  ).json();
  assert.deepEqual(deployments.data, []);
  assert.equal(
    (await request("/v1/projects?first=101", { key: keyA })).status,
    400,
  );
});
test("DataLoader batching preserves two-query owner fetching", async () => {
  const res = await request("/graphql", {
    key: keyA,
    method: "POST",
    body: { query: "{projects{edges{node{id owner{id}}}}}" },
  });
  assert.equal(res.headers.get("x-prism-db-queries"), "2");
});
test("nested deployment pages batch across projects with independent cursor validation", async () => {
  const res = await request("/graphql", {
    key: keyA,
    method: "POST",
    body: {
      query:
        "{projects{edges{node{id owner{id} deployments(first:2){edges{node{id}}}}}}}",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-prism-db-queries"), "3");
  const body = await res.json();
  assert(!body.errors);
  assert(
    body.data.projects.edges
      .flatMap(
        (e: { node: { deployments: { edges: { node: { id: string } }[] } } }) =>
          e.node.deployments.edges,
      )
      .every((e: { node: { id: string } }) => e.node.id !== db.id),
  );
});
test("concurrent rate limits are shared across independent store instances", async () => {
  const second = createPostgresStore(url);
  try {
    const result = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? store : second).limits.take("test:concurrent", 3, 0.001),
      ),
    );
    assert.equal(result.filter((r) => r.allowed).length, 3);
    assert(result.filter((r) => !r.allowed).every((r) => r.retryAfter > 0));
  } finally {
    await second.close();
  }
});
test("rate-limited API requests return 429 and are metered", async () => {
  const k = newKey(a.workspaceId, "Sandbox", "sandbox");
  await store.keys.insert(k.record);
  const statuses = await Promise.all(
    Array.from({ length: 14 }, () =>
      request("/v1/projects", { key: k.secret }).then((r) => r.status),
    ),
  );
  assert(statuses.includes(429));
  const summary = await store.usage.summary(
    a.workspaceId,
    k.record.id,
    Date.now() - 3600000,
  );
  assert.equal(summary.total, 14);
  assert(summary.limited > 0);
});
test("revocation rejects subsequent requests and does not affect another workspace", async () => {
  const k = await request("/api/keys", {
    cookie: cookieA,
    method: "POST",
    body: { name: "Temporary" },
  });
  const created = await k.json();
  assert.equal(k.status, 201);
  assert.equal(
    (
      await request(`/api/keys/${created.key.id}`, {
        cookie: cookieA,
        method: "DELETE",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/v1/projects", { key: created.secret })).status,
    401,
  );
  assert.equal((await request("/v1/projects", { key: keyB })).status, 200);
});
test("workspace key cap holds under concurrent creation", async () => {
  const result = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      request("/api/keys", {
        cookie: cookieB,
        method: "POST",
        body: { name: `Concurrent ${i}` },
      }),
    ),
  );
  assert.equal(result.filter((r) => r.status === 201).length, 4);
  assert.equal(result.filter((r) => r.status === 409).length, 4);
});
test("keys, sessions, projects, usage and buckets persist after closing and reopening stores", async () => {
  const reconnected = createPostgresStore(url);
  try {
    assert.equal(
      (await reconnected.data(a.workspaceId).project.findManyByIds([pa.id]))[0]
        .id,
      pa.id,
    );
    assert(
      (await reconnected.keys.listByAccount(a.workspaceId)).some(
        (k) => k.id === keyIdA,
      ),
    );
    const summary = await reconnected.usage.summary(
      a.workspaceId,
      keyIdA,
      Date.now() - 3600000,
    );
    assert(summary.total > 0);
    assert(summary.averageMs !== null);
    assert(summary.byKey.every((k) => k.keyId === keyIdA));
    assert(
      (await reconnected.limits.peek("test:concurrent", 3, 0.001)).remaining <
        3,
    );
    const sessionCount = await pool.query(
      "select count(*)::int as n from sessions",
    );
    assert(sessionCount.rows[0].n >= 2);
  } finally {
    await reconnected.close();
  }
});
test("CSRF checks, login failure, session invalidation and malformed inputs", async () => {
  assert.equal(
    (
      await request("/api/keys", {
        cookie: cookieA,
        method: "POST",
        origin: "https://attacker.example",
        body: { name: "Attack" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/keys", {
        cookie: cookieA,
        method: "POST",
        body: { name: 123 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/auth/login", {
        method: "POST",
        body: { email: a.email, password: "incorrect-password" },
      })
    ).status,
    401,
  );
  const res = await request("/api/auth/login", {
    method: "POST",
    body: { email: a.email, password },
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await request("/api/keys", { cookie })).status, 200);
  assert.equal(
    (await request("/api/auth/logout", { cookie, method: "POST" })).status,
    200,
  );
  assert.equal((await request("/api/keys", { cookie })).status, 401);
  assert.equal(
    (await request("/graphql", { key: keyA, method: "POST", body: null }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/graphql", {
        key: keyA,
        method: "POST",
        body: {
          query: "{projects{edges{node{id}}}}",
          variables: { oversized: "x".repeat(70000) },
        },
      })
    ).status,
    400,
  );
});
test("generated SDK uses API-key identity without client workspace IDs", async () => {
  const prism = new Prism({ key: keyA, baseUrl: origin });
  const project = await prism.projects.get(pa.id, { include: ["owner"] });
  assert.equal(project.owner.id, a.userId);
  await assert.rejects(
    () => prism.projects.get(pb.id),
    (e) => (e as { status: number }).status === 404,
  );
});
test("committed SDK matches the current generator", async () => {
  assert.equal(
    await readFile("sdk/prism.ts", "utf8"),
    generateSdk().replace("__BASE_URL__", "https://api.example.com"),
  );
});

test("public sandbox is idempotent, scoped, read-only and uses working resource IDs", async () => {
  const response = await request("/api/sandbox");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const demo = await response.json();
  assert.equal(demo.key, sandboxKey);
  const rows = await pool.query("select count(*)::int as n from projects where workspace_id='wsp_prism_sandbox'");
  assert.equal(rows.rows[0].n, 3);
  for (const path of ["/v1/projects?first=2", `/v1/projects/${demo.projectId}`, `/v1/projects/${demo.projectId}/deployments`, `/v1/users/${demo.userId}`, `/v1/deployments/${demo.deploymentId}`])
    assert.equal((await request(path, { key: demo.key })).status, 200);
  assert.equal((await request(`/v1/projects/${pa.id}`, { key: demo.key })).status, 404);
  assert.equal((await request(`/v1/projects/${demo.projectId}`, { key: keyA })).status, 404);
  assert.equal((await request("/v1/projects", { key: demo.key, method: "POST", body: { name: "Changed" } })).status, 405);
  assert.equal((await request("/api/workspace", { key: demo.key, method: "POST", body: { name: "Changed", slug: "changed" } })).status, 401);
  const ownSandbox = newKey(a.workspaceId, "Not public", "sandbox");
  await store.keys.insert(ownSandbox.record);
  assert.equal(await describeSandbox(store, ownSandbox.secret), null);
  await store.keys.revoke(a.workspaceId, ownSandbox.record.id);
  assert.equal(await describeSandbox(store, undefined), null);
  assert.equal(await describeSandbox(store, "<placeholder-key-at-least-24-characters>"), null);
});

test("sandbox demonstrates batching on and off and obeys revocation", async () => {
  // Reset only this test's sample bucket to keep the demonstration deterministic.
  await pool.query("delete from rate_buckets where id='key_prism_sandbox'");
  const query = "{projects{edges{node{name owner{name} deployments(first:2){edges{node{id}}}}}}}";
  for (const [batch, expected] of [["on", "3"], ["off", "7"]]) {
    const response = await fetch(`${origin}/graphql`, { method: "POST", headers: { authorization: `Bearer ${sandboxKey}`, "content-type": "application/json", "x-prism-batching": batch }, body: JSON.stringify({ query }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-prism-db-queries"), expected);
    assert.equal((await response.json()).errors, undefined);
  }
  await store.keys.revoke("wsp_prism_sandbox", "key_prism_sandbox");
  assert.equal((await request("/api/sandbox")).status, 503);
  assert.equal((await request("/v1/projects", { key: sandboxKey })).status, 401);
  // Re-provisioning keeps an operator's revocation; only an explicit restore re-enables it.
  assert.deepEqual(await provisionSandbox(pool, sandboxKey), { revoked: true });
  assert.equal((await request("/api/sandbox")).status, 503);
  assert.deepEqual(await provisionSandbox(pool, sandboxKey, { restore: true }), { revoked: false });
  assert.equal((await request("/api/sandbox")).status, 200);
});
test("migrations preserve legacy demo records outside active tables", async () => {
  await pool.query("create schema legacy_test");
  const legacyPool = new Pool({
    connectionString: url,
    options: "-c search_path=legacy_test",
  });
  try {
    await legacyPool.query(
      await readFile("tests/fixtures/legacy-schema.sql", "utf8"),
    );
    await migrate(legacyPool);
    await migrate(legacyPool);
    assert.equal(
      (await legacyPool.query("select id from legacy_demo_projects")).rows[0]
        .id,
      "prj_demo",
    );
    assert.equal(
      (await legacyPool.query("select count(*)::int as n from projects"))
        .rows[0].n,
      0,
    );
  } finally {
    await legacyPool.end();
    await pool.query("drop schema legacy_test cascade");
  }
});
test("observed query documents do not store literal private IDs", async () => {
  await gql(keyA, `{project(id:"${pa.id}"){id}}`);
  const operations = await store.operations.list(0);
  assert(operations.length > 0);
  assert(operations.every((o) => !o.document.includes(pa.id)));
});
test("developer pages and schema/SDK endpoints remain available", async () => {
  for (const path of [
    "/",
    "/dashboard",
    "/docs",
    "/playground",
    "/demo",
    "/prism-icon.svg",
    "/api/schema",
    "/api/sdk",
  ])
    assert.equal((await request(path)).status, 200);
  const schema = await readFile("schema.graphql", "utf8");
  assert(schema.includes("type Project"));
  assert(!logs.includes("Module not found"));
});
test("someone else's failed sign-ins cannot lock out a browser that signed in before", async () => {
  const deviceCookie = (res: Response) =>
    res.headers.getSetCookie().find((c) => c.startsWith("prism_device="))!.split(";")[0];
  const owner = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Lockout", email: "lockout@example.test", password },
  });
  assert.equal(owner.status, 201);
  const device = deviceCookie(owner);
  for (const email of ["lockout@example.test", "lockout-other@example.test"])
    for (let i = 0; i < 6; i++)
      await request("/api/auth/login", {
        method: "POST",
        body: { email, password: "incorrect-password" },
      });
  const login = (email: string, cookie?: string) =>
    request("/api/auth/login", { method: "POST", cookie, body: { email, password } });
  // Unknown browsers stay throttled; the owner's browser is not.
  assert.equal((await login("lockout@example.test")).status, 429);
  assert.equal((await login("lockout@example.test", device)).status, 200);
  // A device cookie is bound to its email and cannot bypass another account's throttle.
  assert.equal((await login("lockout-other@example.test", device)).status, 429);
});
test("out-of-range integers, mistyped variables and sandbox-plan keys are client errors", async () => {
  for (const first of ["2147483648", "99999999999999999999"])
    assert.equal((await request(`/v1/projects?first=${first}`, { key: keyA })).status, 400);
  const res = await request("/graphql", {
    key: keyA,
    method: "POST",
    body: { query: "query($f:Int){projects(first:$f){pageInfo{hasNextPage}}}", variables: { f: "ten" } },
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).errors[0].message.includes("$f"));
  assert.equal(
    (await request("/api/keys", { cookie: cookieA, method: "POST", body: { name: "Sandbox?", plan: "sandbox" } })).status,
    400,
  );
});
test("hourly usage buckets align to UTC hours in any database time zone", async () => {
  // Quarter-hour offset: date_trunc('hour') in this zone never matches a UTC hour.
  const zoned = createPostgresStore(`${url}?options=${encodeURIComponent("-c timezone=Asia/Kathmandu")}`);
  try {
    const now = Date.now();
    await zoned.usage.record({ keyId: keyIdA, workspaceId: a.workspaceId, at: now, route: "GET /v1/tz", status: 200, latencyMs: 1 });
    const s = await zoned.usage.summary(a.workspaceId, keyIdA, now - 3_600_000);
    assert.ok(s.ok > 0);
    assert.equal(s.hourly.reduce((n, h) => n + h.ok + h.limited + h.errors, 0), s.total);
  } finally {
    await zoned.close();
  }
});
test("repeated failed sign-ins are persistently throttled", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++)
    statuses.push(
      (
        await request("/api/auth/login", {
          method: "POST",
          body: { email: "throttle@example.test", password },
        })
      ).status,
    );
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
});
test("migration and optional development seed commands are reproducible and isolated", async () => {
  async function command(
    script: string,
    nodeEnv: "development" | "production" = "development",
  ) {
    const child = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", script],
      {
        env: {
          ...process.env,
          NODE_ENV: nodeEnv,
          DATABASE_URL: url,
          DEV_SEED_PASSWORD: password,
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    const [code] = await once(child, "exit");
    return code;
  }
  assert.equal(await command("scripts/db-setup.ts"), 0);
  assert.equal(await command("scripts/db-seed.ts"), 0);
  assert.equal(await command("scripts/db-seed.ts"), 0);
  assert.notEqual(await command("scripts/db-seed.ts", "production"), 0);
  const rows = await pool.query(
    "select p.workspace_id,count(*)::int as n from projects p join workspace_members m on m.workspace_id=p.workspace_id join users u on u.id=m.user_id where u.email=any($1::text[]) group by p.workspace_id",
    [["dev-a@example.test", "dev-b@example.test"]],
  );
  assert.equal(rows.rows.length, 2);
  assert(rows.rows.every((r) => r.n === 3));
  assert(
    (await store.data(a.workspaceId).project.findMany({ take: 100 })).every(
      (p) => p.ownerId === a.userId,
    ),
  );
});
test(
  "actual PostgreSQL and HTTP process restarts preserve credentials, data and usage",
  { timeout: 120000 },
  async () => {
    const before = await store.usage.summary(
      a.workspaceId,
      keyIdA,
      Date.now() - 3600000,
    );
    await stopServer();
    await store.close();
    await pool.end();
    await pg!.stop();
    await pg!.start();
    pool = new Pool({ connectionString: url });
    store = createPostgresStore(url);
    await startServer();
    assert.equal((await request("/api/keys", { cookie: cookieA })).status, 200);
    assert.equal(
      (await request(`/v1/projects/${pa.id}`, { key: keyA })).status,
      200,
    );
    const usage = await (
      await request(`/api/usage?keyId=${keyIdA}`, { cookie: cookieA })
    ).json();
    assert(usage.summary.total >= before.total);
    assert(
      (await store.limits.peek("test:concurrent", 3, 0.001)).remaining < 3,
    );
  },
);
