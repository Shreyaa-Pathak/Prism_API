# PostgreSQL multi-user expansion — engineering report

## Architecture

The audit found Next.js App Router, React, TypeScript, `pg` (no ORM), GraphQL Tools, and per-request DataLoaders. REST already compiled generated routes into GraphQL operations; this design was retained. Previously, `lib/store/seed.ts` generated the global workspace, `memory.ts` loaded it automatically, and `db-setup.ts` copied it into PostgreSQL. PostgreSQL resource queries were unscoped. Dashboard accounts were self-issued signed cookies, and rate buckets were process-local.

Normal request paths now require PostgreSQL. `lib/store/postgres.ts` returns a repository bound to an authenticated workspace. REST, GraphQL, and dashboard routes all use it. The public schema and SDK models remain separate from database models through explicit row mappings.

Dashboard flow: password sign-in → random opaque session cookie → hashed session lookup → user/workspace membership → scoped repository. API flow: bearer key → SHA-256 lookup → stored workspace → persistent token bucket → REST-generated GraphQL or direct GraphQL → scoped repository → response and usage event.

Passwords use salted scrypt (N=32768, r=8, p=3). Seven-day sessions store only an HMAC of the random credential; a strong runtime session secret is required. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Logout deletes the database session. Login/register attempts are persistently throttled.

## Database

- `users`: unique normalized email, password hash, profile, timestamps.
- `workspaces` and `workspace_members`: account ownership and future team membership.
- `sessions`: hashed credential, user/workspace membership, expiration.
- `projects`: workspace, owner/member, workspace-unique slug, creation time.
- `deployments`: workspace/project relationship, status, branch, commit, creation time.
- `api_keys`: workspace, name, safe prefix, unique hash, plan, creation/last-use/revocation times.
- `usage_events`: workspace/key, timestamp, normalized HTTP method/route, status, latency.
- `rate_buckets`: persistent, shared token counts and database timestamps.
- `observed_operations`: scrubbed operation shapes for the admin-only compatibility check.
- `prism_migrations`: version/checksum history.

Composite foreign keys ensure project owners belong to the same workspace and deployments/usage cannot reference another workspace's project/key. Membership references restrict removing owners; workspace/project/key-dependent data uses appropriate cascades. Indexes cover workspace pagination, project deployment pages, workspace/key usage, membership lookup, and expiration/retention access.

## Data isolation

The server obtains workspace identity only from a verified session or API-key record. Client-supplied owner/workspace fields cannot establish identity. Every resource lookup includes the bound workspace in SQL, including batched member/project lookups and nested deployment pages. Cursor subqueries include both workspace and, for deployments, project. Authorization happens before records are returned or paginated.

Unauthorized REST resources return 404; nullable GraphQL resources return null. Foreign cursors return empty pages. Dashboard project/deployment reads and writes, key revocation, and usage filters apply the same scope. Tests verify isolation in both directions for two separately registered personas.

## API and dashboard

The public GraphQL schema, REST routes, pagination parameters, and SDK `key` option are unchanged. Owners, projects, and nested deployment pages remain batched; a projects/owners/deployments query now needs three resource queries regardless of the number of projects in the page.

Added session endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me`. The dashboard can create and list projects, record/view deployment history, manage keys, and show persistent workspace usage. Project creation and deployment recording use `/api/workspace` and `/api/workspace/deployments`; public REST/GraphQL writes remain future work.

Docs/playground accept the caller's key. List examples work on the caller's records; individual-resource paths are editable. The SDK authenticates without a workspace argument. Usage aggregates are computed in SQL without a fixed event-count cutoff and include average latency and counts per key.

Intentional behavior changes: automatic anonymous accounts, in-memory fallback, and the fixed public sandbox key are removed. Existing demo keys cannot prove authenticated ownership and must be reissued. This is an authorization change, not a public schema change. Old demo tables are retained as `legacy_demo_*` and are never queried by active repositories.

## Security

Environment files are ignored by Git and excluded from Docker builds. No application credential/session-secret fallback exists. Production data access requires the database, a non-placeholder session secret, and an HTTPS public origin. JSON bodies are capped before parsing; query size, field count, depth, pagination, key names, and write inputs are validated. Session mutations require the configured same origin. Error responses hide internal database/resolver details.

Keys are shown on creation and stored only as hashes; each request checks revocation. The browser temporarily retains a newly created key in tab session storage for runnable examples, cleared on sign-in/sign-out. Admin query-history access uses constant-time credential comparison and is disabled without a strong, non-placeholder token. Operation variables are never stored; string/numeric literals are scrubbed.

Rate-limit consumption is serialized with database row locks, using database time rather than individual server clocks. Concurrent key creation is serialized per workspace to enforce the five-key cap.

The Next.js PostCSS dependency was patched within the existing framework version. `npm audit --omit=dev` reports zero findings. The full audit reports nine development-tool findings (seven high, two moderate); they remain visible and require upstream fixes or a separately tested tooling upgrade.

## Migrations and environment

Configure PostgreSQL credentials and application settings in `.env` using placeholders replaced locally:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/prism
SESSION_SECRET=<random-secret-at-least-32-characters>
PRISM_PUBLIC_URL=http://localhost:3000
POSTGRES_USER=<database-user>
POSTGRES_PASSWORD=<strong-database-password>
POSTGRES_DB=prism
```

`POSTGRES_*` settings are required only for the supplied Docker Compose database. Use HTTPS for the public origin in production. Optional settings: `ADMIN_TOKEN` for the CI query-history endpoint and `DEV_SEED_PASSWORD` for explicit development personas.

```powershell
npm ci
Copy-Item .env.example .env
# Replace the placeholders in .env before continuing.
docker compose up -d
npm run db:migrate
npm run dev
```

For an existing PostgreSQL server, omit Docker Compose. Optional development data:

```powershell
# First configure DEV_SEED_PASSWORD in .env.
npm run db:seed
```

Migrations run transactionally under an advisory lock and verify checksums on reruns. Development seeding is separate, creates two isolated accounts/workspaces, and is disabled in production. Back up existing databases before deployment. Ownership of legacy records is not guessed or silently reassigned.

## Tests and validation

26 automated tests passed using real native PostgreSQL and HTTP requests to Prism. Coverage includes password hashing, missing/default-secret rejection, old-cookie rejection, valid/invalid/revoked keys, REST and GraphQL isolation, aliased/fragment queries, nested resources, database relationship constraints, dashboard writes/keys/usage isolation, foreign cursors, pagination validation, DataLoader batching, concurrent distributed rate limiting, 429 metering, concurrent key caps, session logout, CSRF, oversized input, SDK requests/generation, legacy migration, scrubbed operation history, developer endpoints, sign-in throttling, migration/seed commands, and actual database/app-process restarts.

| Validation | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed, no warnings |
| Automated tests | 26 passed; none skipped |
| Production build | Passed |
| Database migration | Passed on fresh and original legacy schemas; reruns passed |
| Development seed commands | Passed twice; production invocation rejected |
| REST / GraphQL | Isolation and behavior checks passed over HTTP |
| SDK generation | Passed; committed output matches generator; authenticated calls tested |
| Schema compatibility | Passed; zero breaking changes against snapshot |
| Production dependency audit | Passed; zero findings |

No live observed-operations source was configured during local compatibility validation, so all structural breaking changes were treated as blocking. Test credentials were generated for disposable local clusters; no existing user database was modified. Validation ran on Windows with Node.js 25.8 and PostgreSQL 18; CI targets Node.js 22, and the Compose setup targets PostgreSQL 16. Docker/Kubernetes deployment itself was not executed in this environment.

## Remaining production work

Add email verification, password recovery, your registration/abuse policy, and any required MFA/SSO. Configure HTTPS, managed secrets, backups/restore drills, monitoring, and retention jobs for sessions, usage, buckets, and observed operations. Resolve the remaining development-tool audit findings. Benchmark PostgreSQL token-bucket transactions at the intended traffic level; use the existing abstraction to adopt Redis only if needed. Team administration/roles, workspace switching, API scopes, public write APIs, and deployment execution are deliberately outside the initial one-user-one-workspace implementation.
