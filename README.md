# Prism API

A persistent, multi-user developer API platform built with Next.js, TypeScript, PostgreSQL, GraphQL, and REST. A single GraphQL schema drives REST routes, interactive documentation, and the generated TypeScript SDK.

Each account starts with its own empty workspace. Dashboard identity comes from a database-backed session; API identity comes from a hashed API key attached to that workspace. Requests require PostgreSQL; private workspaces never fall back to shared sample data.


## Public sandbox demo

Set `PRISM_SANDBOX_KEY` in `.env` and your deployment's runtime configuration to a distinct random value of at least 24 characters. This credential is **intentionally public** and must never be a private workspace key. Generate one with `node -e "console.log('prism_sandbox_'+require('node:crypto').randomBytes(24).toString('hex'))"`.

```bash
npm run db:migrate
npm run sandbox:setup
npm run dev
```

Open `/demo` and click **Try sandbox**. No registration is needed. Docs and the playground use the sample key, and resource examples automatically receive working IDs. Choose **Use my own key** to leave sandbox mode; your personal tab key is not overwritten. Sandbox selection persists in this tab and is revalidated against the server on a reload.

Sample reads use the same PostgreSQL repositories, resolvers, authentication, rate limiting, and metering as ordinary reads. Public writes remain disabled. All visitors share a bucket with burst 10 and refill 1/s; 429 responses include `Retry-After`. The public key reveals only synthetic sample data, including an example.test member email. Never add private records to this workspace.

## Development setup

Use Node.js 22 or newer and PostgreSQL 16 or newer.

```bash
npm ci
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Replace ALL credential placeholders in `.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/prism
SESSION_SECRET=<random-secret-at-least-32-characters>
PRISM_PUBLIC_URL=http://localhost:3000
POSTGRES_USER=<database-user>
POSTGRES_PASSWORD=<strong-database-password>
POSTGRES_DB=prism
```

Use an independently generated random session secret. A placeholder or missing secret cannot issue sessions. Production also requires an HTTPS `PRISM_PUBLIC_URL`. URL-encode database passwords containing reserved URL characters. `.env` and `.env.local` are ignored by Git and excluded from Docker builds.

If using the included Docker Compose database:

```bash
docker compose up -d
npm run db:migrate
npm run dev
```

If PostgreSQL is already running, configure `DATABASE_URL`, run `npm run db:migrate`, then `npm run dev`. Migration scripts load `.env`/`.env.local`; `db:setup` is an alias for migrations and does not seed anything.

### Why Docker is included

Docker is optional. `docker-compose.yml` runs only PostgreSQL 16, with its data stored in the `prism-pg` volume and its port bound to localhost. The application runs separately through `npm run dev`. This gives developers a consistent database without installing PostgreSQL directly.

The `Dockerfile` builds a standalone production Next.js server using build stages and runs it as the unprivileged `prism` user. Use it when deploying to a container host or Kubernetes. For a direct Node.js deployment, run `npm run build` and `npm start` against your own PostgreSQL server.

### Existing installation rename

Update local and deployment configuration to use `PRISM_PUBLIC_URL`, SDK imports from `sdk/prism`, and the `Prism`/`PrismError` classes. CI uses the `PRISM_URL` repository variable and `PRISM_ADMIN_TOKEN` secret. Browser sessions and saved tab keys use new names, so sign in again after upgrading.

Migrations automatically adopt a single previous migration-history table with the expected columns as `prism_migrations`, preserving its checksums. Existing database contents are retained. The Compose volume name has changed: reconnect an existing data volume through the `prism-pg` volume's `external`/`name` settings before starting Compose if you need its existing data. `DATABASE_URL` and `POSTGRES_DB` must point to the same actual database; changing an example database name does not rename an existing database.

Open http://localhost:3000/dashboard, create an account, create a project, record deployment history, and create an API key. Copy the key when it is created; the server stores only its SHA-256 hash. Prism records deployment history; it does not build or deploy applications.

For optional development personas, set `DEV_SEED_PASSWORD` to a development-only password of at least 12 characters, then run:

```bash
npm run db:seed
```

This creates `dev-a@example.test` and `dev-b@example.test`, each with a distinct workspace, three projects, and deployment records. It creates no public API key. Sign in with the configured development password and create a workspace key. Seed execution is disabled with `NODE_ENV=production`.

## Request flow

```text
Dashboard -> password login -> opaque session cookie -> user + workspace
External app -> API key hash lookup -> workspace -> shared PostgreSQL token bucket
REST -> generated GraphQL operation --+
GraphQL -----------------------------+-> workspace-bound repository -> PostgreSQL
                                      -> response + persistent usage event
```

`lib/store/postgres.ts` binds the authenticated workspace before any resource query runs. SQL filters projects, deployments, users/members, and cursor lookups within that workspace. Composite foreign keys prevent assigning a project owner or deployment from another workspace. REST executes the same GraphQL resolvers and repository as GraphQL.

Users have workspace memberships, leaving room for teams later. Initially each new user receives one workspace; there is no client-controlled workspace switching or membership-management endpoint.

## Using the API

```bash
curl "http://localhost:3000/v1/projects?first=2&include=owner" \
  -H "Authorization: Bearer <API_KEY>"
```

```ts
import { Prism } from "./sdk/prism";
const prism = new Prism({
  key: process.env.PRISM_KEY!,
  baseUrl: "http://localhost:3000",
});
const page = await prism.projects.list({ first: 2, include: ["owner"] });
```

The key determines ownership; callers do not send a workspace ID. REST reads of another workspace's IDs return 404. GraphQL nullable lookups return null. Foreign pagination cursors return an empty page. Lists and nested relations are filtered in SQL before pagination.

| Path | Purpose |
| --- | --- |
| `/dashboard` | Register/sign in, projects, deployments, API keys, and 24-hour usage |
| `/docs` | Runnable examples with your own key and editable resource IDs |
| `/playground` | GraphQL editor with your own key and batching toggle |
| `/demo`, `/api/sandbox` | Guided walkthrough and optional public sandbox discovery |
| `/graphql` | Shared-schema GraphQL reads |
| `/v1/projects` | Your workspace's projects |
| `/v1/projects/:id` | A project accessible to your key |
| `/v1/projects/:id/deployments` | Scoped deployment history |
| `/v1/deployments/:id`, `/v1/users/:id` | Scoped deployment/member lookups |
| `/api/sdk`, `/api/schema` | Generated SDK and schema |
| `/api/health` | Database/schema readiness; 503 when unavailable |

The public REST and GraphQL schemas remain read-only. Creating projects and recording deployments use authenticated dashboard routes (`POST /api/workspace`, `POST /api/workspace/deployments`). API scopes and public write operations are future work.

Runnable examples and the playground share one key: a pasted key or the key just created in this tab (creating a key also leaves sandbox mode). The tab temporarily retains that key in session storage; sign-in, sign-out, and revoking that key clear it. While the sandbox is active its key is shown read-only. A key stored by the caller is still a credential: keep it private. The former fixed public sandbox key no longer works. Individual examples use `YOUR_PROJECT_ID` placeholders; replace them with IDs from the dashboard or list results.

## Storage and migrations

Versioned, checksummed migrations are in `db/migrations`. They run transactionally under an advisory lock and can be rerun safely. Applied migrations must not be edited; create a new SQL migration.

Tables: users, workspaces, workspace_members, sessions, projects, deployments, api_keys, usage_events, rate_buckets, observed_operations, and prism_migrations. Workspace/project/key foreign keys and access-pattern indexes protect relations and support scoped pagination/usage queries.

The first migration preserves existing demo tables as `legacy_demo_*`. Old browser accounts and keys are not migrated into authenticated accounts because their ownership cannot be trusted. Old keys stop working; register and issue new ones. No legacy records are exposed by active repositories. Back up an existing database before deployment; legacy cleanup or audited manual reassignment is a separate operator task.

## Rate limits and usage

Buckets are stored in PostgreSQL and updated under a row lock using database time. They survive restarts and are shared by all app replicas. Sandbox-plan keys allow a burst of 10 and refill 1/s; standard keys allow 100 and refill 10/s. Dashboard-created keys are always standard; the sandbox plan is reserved for the provisioned sample key.

Sign-in attempts are limited to 5 per email, refilling 1/minute, plus a shared limit on attempts from unrecognised browsers. A successful sign-in leaves a signed, HttpOnly device cookie for that email; later attempts from that browser use their own limit, so someone else's failed guesses cannot lock the owner out. Revocation is checked on each request. The SDK retries 429 responses using `Retry-After`.

Usage stores workspace/key, normalized route including HTTP method, HTTP status, latency, and timestamp, without request bodies. The dashboard uses SQL aggregates for totals, success/error/429 counts, average latency, p50/p99, hourly activity, top routes, and counts per key. GraphQL errors returned with HTTP 200 count as HTTP success. Authenticated 429 responses are metered; rejected unknown keys are not assigned to a workspace.

DataLoaders batch owner, project, and nested deployment-page lookups per request. Responses expose `X-Prism-DB-Queries`; disabling batching in the playground demonstrates additional queries.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run schema:check
npm run test:schema
npm run demo:schema-check
npm run sdk:generate
npm audit --omit=dev
```

Integration tests start a disposable native PostgreSQL cluster and a local Prism server, exercise real HTTP REST/GraphQL/dashboard/auth routes, and remove only their own test cluster. They do not use `DATABASE_URL` or an existing database. The embedded-postgres package downloads platform binaries through npm; Windows x64 and normal non-root Linux runners are supported. Test artifacts live in ignored `.test-postgres/`. Run test/build commands sequentially because Next.js uses `.next` for both.

For CI SDK comparison, regenerate with `PRISM_PUBLIC_URL=https://api.example.com` (the checked-in SDK default); configure `baseUrl` when consuming it. CI runs isolation tests, lint, type checks, schema compatibility, SDK consistency, build, and the production dependency audit.

Local schema checks default to the committed `schema.graphql` snapshot. Use `npm run schema:check -- --baseline-ref main` to read that snapshot from a trusted Git revision instead of the working tree. CI requires a baseline revision and uses the PR base SHA or previous push SHA, with full history fetched; a first push bootstraps against the root commit snapshot. The baseline must contain `schema.graphql`; missing revisions/snapshots fail the check. Do not regenerate the baseline in the PR check.

Without observed traffic, all structural schema-breaking changes block. To use live traffic, configure the GitHub repository variable `PRISM_URL` and secret `PRISM_ADMIN_TOKEN`; set matching `ADMIN_TOKEN` on the server. `/api/internal/observed-operations` is disabled without a non-placeholder admin token. Observed documents are normalized with string/numeric literals scrubbed; variable values are never saved. The endpoint is admin-only. Malformed or unavailable configured operation history fails the check; an explicitly valid empty history means no observed queries. Queries last seen exactly 30 days ago are included; older queries are excluded. The gate checks GraphQL document compatibility, not arbitrary resolver behavior or every possible runtime variable value.

`npm run demo:schema-check` demonstrates a blocked removal affecting a recent query, an allowed removal after that query expires from the window, and the conservative fallback, using synthetic operations without a production service. `npm run test:schema` covers these rules, fragments/aliases, required arguments, invalid feeds, and a working snapshot edit that cannot alter a trusted Git baseline.

## Production deployment and remaining work

`Dockerfile` produces a standalone Next.js server. Supply `DATABASE_URL`, a strong `SESSION_SECRET`, and HTTPS `PRISM_PUBLIC_URL` through your runtime secret/config system. `ADMIN_TOKEN` is optional. Run migrations once before starting the new release. Kubernetes manifests include readiness/liveness probes and placeholder image/origin values that must be replaced.

Before broad public deployment, implement your account policy (email verification, password recovery, optional MFA/SSO), registration abuse controls at a trusted gateway, backups and restore drills, HTTPS termination, and retention/cleanup jobs for expired sessions, inactive buckets, usage, and observed operations. Add team roles/workspace switching only with explicit authorization checks. PostgreSQL bucket transactions suit initial traffic; benchmark before high-volume deployment and replace the limit abstraction with Redis if necessary. Persistent usage aggregates avoid truncating metrics, but sustained growth needs retention/rollups. Health/schema checks do not replace monitoring.

The production dependency audit currently passes. The full audit still flags nine development-tool dependency findings (seven high, two moderate), including unpatched `braces` used by Tailwind/ESLint and selector-parser dependencies. These need upstream fixes or a separately validated tooling upgrade. No audit findings are hidden or disabled.
