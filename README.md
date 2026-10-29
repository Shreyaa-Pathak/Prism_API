# Prism API

Prism is a developer API platform. It lets external apps read a team's **projects, owners and deployment history** through a secure API instead of scraping a dashboard. It provides REST and GraphQL endpoints, API keys, rate limits, usage analytics, runnable docs and a generated TypeScript SDK.

Built with **Next.js 15, TypeScript, PostgreSQL and GraphQL**.

**Live demo: [prism-apis.vercel.app](https://prism-apis.vercel.app)**

![Prism API home page: a runnable API example next to an overview of the shared schema, rate limits and runnable docs](docs/images/home.png)

## Why it was built

Most teams that offer an API maintain the GraphQL API, REST routes, docs and SDK separately, and they drift apart. Prism was built to show the opposite approach: **one GraphQL schema is the single source of truth**, and everything else is generated from it.

- The REST routes are compiled from the schema at startup.
- The TypeScript SDK is generated from the same schema.
- The docs list the real routes and run real requests.
- A CI check blocks schema changes that would break queries clients actually sent in the last 30 days.

Around that core, it implements what a production API needs: per-workspace data isolation, hashed API keys, token-bucket rate limiting, usage metering, and protection against the GraphQL N+1 query problem.

## What you can do with it

- **Create an account.** Each account gets its own private workspace.
- **Add projects and record deployments** from the dashboard.
- **Create API keys.** Up to 5 per workspace. A key is shown once and stored only as a SHA-256 hash.
- **Read your data from any app** with REST, GraphQL or the TypeScript SDK.
- **Watch usage live:** requests, errors, 429s, p50/p99 latency, top routes and remaining rate-limit tokens per key.
- **Try requests in the browser** in the runnable docs (`/docs`) and the GraphQL playground (`/playground`).
- **See DataLoader batching at work.** Turn batching off in the playground and watch the database query count rise.
- **Explore without an account** using the optional read-only public sandbox (`/demo`).

```bash
curl "https://your-app.example.com/v1/projects?first=2&include=owner" \
  -H "Authorization: Bearer <API_KEY>"
```

```ts
import { Prism } from "./prism"; // download from /api/sdk
const prism = new Prism({ key: process.env.PRISM_KEY! });
const page = await prism.projects.list({ first: 2, include: ["owner"] });
```

The key alone decides whose data you see. Callers never send a workspace ID, and requests for another workspace's IDs return 404.

## Pages and endpoints

| Path | Purpose |
| --- | --- |
| `/dashboard` | Sign up / sign in, projects, deployments, API keys, 24-hour usage |
| `/docs` | Runnable examples using your key |
| `/playground` | GraphQL editor with a batching on/off toggle |
| `/demo` | Guided walkthrough and the optional public sandbox |
| `/graphql` | GraphQL endpoint (read-only) |
| `/v1/projects`, `/v1/projects/:id`, `/v1/projects/:id/deployments` | REST: projects and their deployments |
| `/v1/deployments/:id`, `/v1/users/:id` | REST: single deployment / workspace member |
| `/api/sdk`, `/api/schema` | Generated TypeScript SDK and GraphQL schema |
| `/api/health` | Health check (503 if the database is unavailable) |

The public API is read-only. Projects and deployments are created from the dashboard.

## Rate limits

Each key has a token bucket stored in PostgreSQL, so limits survive restarts and are shared across all server instances.

| Plan | Burst | Refill |
| --- | --- | --- |
| Standard (dashboard keys) | 100 requests | 10 / second |
| Sandbox (public demo key) | 10 requests | 1 / second |

Every response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, and a 429 includes `Retry-After`. The SDK retries 429s automatically.

Sign-in is limited to 5 attempts per email. A browser that has signed in before gets its own limit, so other people's failed guesses can't lock the owner out.

## Run it locally

Requires **Node.js 22+** and **PostgreSQL 16+**.

```bash
npm ci
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Fill in `.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/prism
SESSION_SECRET=<random string, at least 32 characters>
PRISM_PUBLIC_URL=http://localhost:3000
```

If you don't have PostgreSQL installed, `docker compose up -d` starts one. It uses the `POSTGRES_*` values in `.env`.

```bash
npm run db:migrate   # create the tables (safe to re-run)
npm run dev          # http://localhost:3000
```

Open `/dashboard`, create an account, a project and an API key, then try the key in `/docs`.

**Optional extras:**
- **Public sandbox:** set `PRISM_SANDBOX_KEY` to a random value of 24+ characters, then run `npm run sandbox:setup`. This key is shown to visitors, so never use a real key.
- **Sample accounts:** set `DEV_SEED_PASSWORD`, then run `npm run db:seed`. It creates `dev-a@example.test` and `dev-b@example.test` with sample projects.

## Deploy

Prism runs on any Node.js host, including Vercel, and needs a PostgreSQL database such as Neon or Supabase.

1. Set these environment variables:
   - `DATABASE_URL`
   - `SESSION_SECRET` (32+ characters)
   - `PRISM_PUBLIC_URL`: your exact **https** site address, with no trailing slash
   - optionally `PRISM_SANDBOX_KEY`
2. Run `npm run db:migrate` once against the production database. On Neon, use the unpooled connection string.
3. Deploy, then check that `/api/health` returns `{"status":"ok","store":"postgres"}`.

`PRISM_PUBLIC_URL` must match the domain users visit, or sign-in is rejected as a cross-site request. A `Dockerfile` and Kubernetes manifests (`k8s/`) are also included for container hosting.

## Development

```bash
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm test               # integration + schema tests (starts a throwaway PostgreSQL)
npm run build          # production build
npm run schema:check   # block breaking GraphQL schema changes
npm run sdk:generate   # regenerate sdk/prism.ts after schema changes
```

Tests start their own temporary PostgreSQL and server. They never touch your `.env` database or your running `npm run dev`. CI runs all of the above, plus `npm audit --omit=dev`, on every pull request and every push to `main`.

## How it's built

```text
Dashboard ── password login ── session cookie ──┐
External app ── API key (hashed) ── rate limit ─┤
                                                 ▼
          REST ── compiled to GraphQL ──► GraphQL resolvers + DataLoader
                                                 ▼
                     workspace-scoped queries ── PostgreSQL
```

| Folder | Contents |
| --- | --- |
| `app/` | Pages and API routes (Next.js App Router) |
| `components/` | UI: dashboard, docs examples, playground, sandbox |
| `graphql/` | Schema, resolvers, REST generator, SDK generator, schema check |
| `lib/` | Auth, sessions, API keys, rate limits, PostgreSQL store |
| `db/migrations/` | Versioned SQL migrations |
| `sdk/prism.ts` | Generated TypeScript SDK |
| `tests/` | Integration and schema-check tests |

## Limitations

- The public API is read-only. API scopes and write endpoints are future work.
- One workspace per account. There are no teams or roles yet.
- No email verification, password reset or MFA.
- Rate limits and usage live in PostgreSQL. That suits moderate traffic; very high volumes would need Redis, plus usage rollups and data retention.

## License

[MIT](LICENSE) © 2026 Shreya Pathak
