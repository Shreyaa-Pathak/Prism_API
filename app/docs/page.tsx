import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  RunnableExample,
  API_KEY_PLACEHOLDER,
} from "@/components/RunnableExample";
import { CodeBlock } from "@/components/CodeBlock";
import { restRoutes, type RestRoute } from "@/graphql/rest";
import { PLANS } from "@/lib/ratelimit";
import { MAX_PAGE } from "@/graphql/pagination";
import { MAX_DEPTH } from "@/graphql/execute";
import { getOrigin } from "@/lib/origin";
import { SandboxControls } from "@/components/Sandbox";

export const metadata: Metadata = { title: "Docs" };
export const dynamic = "force-dynamic";

const sections = [
  ["quickstart", "Quickstart"],
  ["authentication", "Authentication"],
  ["rate-limits", "Rate limits"],
  ["pagination", "Pagination"],
  ["graphql", "GraphQL"],
  ["rest", "REST reference"],
  ["sdk", "TypeScript SDK"],
  ["errors", "Errors"],
  ["changes", "Breaking changes"],
] as const;

const exampleIds: Record<string, string> = {
  projects: "YOUR_PROJECT_ID",
  users: "YOUR_USER_ID",
  deployments: "YOUR_DEPLOYMENT_ID",
};

function examplePath(r: RestRoute) {
  const p = r.path.replace(":id", exampleIds[r.resource] ?? "1");
  if (r.kind === "get")
    return r.includes.length ? `${p}?include=${r.includes[0]}` : p;
  return `${p}?first=3`;
}

function sdkCall(r: RestRoute) {
  const ns = r.resource;
  if (r.kind === "list") return `await prism.${ns}.${r.action}({ first: 3 });`;
  if (r.kind === "get")
    return `await prism.${ns}.get("${exampleIds[ns]}"${r.includes.length ? `, { include: ["${r.includes[0]}"] }` : ""});`;
  return `await prism.${ns}.${r.action}("${exampleIds[ns]}", { first: 3 });`;
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-t border-line py-12 first:border-t-0 first:pt-0 sm:py-14"
    >
      <h2
        id={`${id}-title`}
        className="text-[clamp(1.75rem,3vw,2.5rem)] font-medium leading-tight tracking-[-0.03em]"
      >
        {title}
      </h2>
      <div className="mt-5 space-y-5 text-[16px] leading-relaxed text-ink-2 [&_p]:max-w-[68ch]">
        {children}
      </div>
    </section>
  );
}

const C = ({ children }: { children: ReactNode }) => (
  <code className="rounded-[5px] bg-warm px-1.5 py-0.5 font-mono text-[0.88em] text-ink">
    {children}
  </code>
);

export default async function Docs() {
  const origin = await getOrigin();
  return (
    <div className="mx-auto grid max-w-page grid-cols-1 gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16 lg:px-12 lg:py-16">
      <nav
        aria-label="Docs"
        className="min-w-0 lg:sticky lg:top-24 lg:self-start"
      >
        <p className="text-[13px] text-muted">Prism API docs</p>
        <ul className="mt-3 flex gap-1 overflow-x-auto pb-1 text-[14px] lg:flex-col lg:overflow-visible">
          {sections.map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                className="block rounded-[8px] px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 max-w-[880px]">
        <SandboxControls />
        <Section id="quickstart" title="Quickstart">
          <p>
            The API lives at <C>{origin}</C>. GraphQL is served at{" "}
            <C>/graphql</C> and REST under <C>/v1</C>. Examples run against your
            own workspace or the public sample workspace. Choose Try sandbox above, or sign in, create a project, and create a key in the{" "}
            <a
              className="underline decoration-accent decoration-2 underline-offset-4"
              href="/dashboard"
            >
              dashboard
            </a>
            .
          </p>
          <p>
            List your projects first. For individual and nested examples,
            replace YOUR_PROJECT_ID, YOUR_USER_ID, or YOUR_DEPLOYMENT_ID in the
            editable request path with an ID from your workspace. Sandbox mode fills these IDs automatically.
          </p>
          <RunnableExample
            origin={origin}
            method="GET"
            path="/v1/projects?first=3&include=owner"
          />
        </Section>

        <Section id="authentication" title="Authentication">
          <p>
            Send your key in the <C>Authorization</C> header as a bearer token,
            or in <C>X-API-Key</C>. Keys are checked by the application gateway before
            resource queries run, and only a SHA-256 hash of each key is
            stored, so a key is shown once when you create it. Requests without
            a valid key get a 401.
          </p>
          <RunnableExample
            origin={origin}
            method="GET"
            path="/v1/projects"
            auth={false}
          />
        </Section>

        <Section id="rate-limits" title="Rate limits">
          <p>
            Each key has a token bucket. A request takes one token and tokens
            refill continuously, so short bursts are fine and sustained traffic
            is smoothed. When the bucket is empty you get a 429 with a{" "}
            <C>Retry-After</C> header in seconds.
          </p>
          <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
            <table className="w-full min-w-[480px] text-left text-[14px]">
              <thead className="text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-normal">Header</th>
                  <th className="px-4 py-2.5 font-normal">Meaning</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-2.5">
                <tr>
                  <td className="font-mono text-[13px]">X-RateLimit-Limit</td>
                  <td>Bucket size for your plan</td>
                </tr>
                <tr>
                  <td className="font-mono text-[13px]">
                    X-RateLimit-Remaining
                  </td>
                  <td>Tokens left after this request</td>
                </tr>
                <tr>
                  <td className="font-mono text-[13px]">X-RateLimit-Reset</td>
                  <td>Seconds until the bucket is full</td>
                </tr>
                <tr>
                  <td className="font-mono text-[13px]">Retry-After</td>
                  <td>Seconds to wait, only on 429</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Sandbox keys hold {PLANS.sandbox.capacity} tokens and refill{" "}
            {PLANS.sandbox.refillPerSec} per second. Standard keys hold{" "}
            {PLANS.standard.capacity} and refill {PLANS.standard.refillPerSec}{" "}
            per second. A burst uses the selected key?s limit:
          </p>
          <RunnableExample
            origin={origin}
            method="GET"
            path="/v1/users/YOUR_USER_ID"
            burst={14}
          />
        </Section>

        <Section id="pagination" title="Pagination">
          <p>
            Lists use cursors. Pass <C>first</C> (1–{MAX_PAGE}, default 20) and,
            for later pages, <C>after</C> set to the previous{" "}
            <C>pageInfo.endCursor</C>. Cursors are opaque and stay valid when
            new rows arrive. Run this, then use Next page.
          </p>
          <RunnableExample
            origin={origin}
            method="GET"
            path="/v1/projects/YOUR_PROJECT_ID/deployments?first=3"
          />
        </Section>

        <Section id="graphql" title="GraphQL">
          <p>
            POST <C>{"{ query, variables }"}</C> to <C>/graphql</C>. Nested
            fields are batched with DataLoader per request, so asking for 20
            projects and their owners costs two database round trips, not 21.
            The <C>X-Prism-DB-Queries</C> header shows the count. Queries deeper
            than {MAX_DEPTH} levels are rejected. The full schema is at{" "}
            <a
              className="underline decoration-accent decoration-2 underline-offset-4"
              href="/api/schema"
            >
              /api/schema
            </a>
            .
          </p>
          <RunnableExample
            origin={origin}
            method="POST"
            path="/graphql"
            body={{
              query:
                "query { projects(first: 5) { edges { node { name owner { name } } } pageInfo { hasNextPage endCursor } } }",
            }}
          />
        </Section>

        <Section id="rest" title="REST reference">
          <p>
            These routes are generated from the GraphQL schema when the server
            starts. Each one compiles to a GraphQL query and runs through the
            same resolvers. Related objects come back as <C>{"{ id }"}</C>;
            expand them with <C>include</C>.
          </p>
          <div className="space-y-10">
            {restRoutes.map((r) => (
              <article
                key={r.path}
                id={`rest-${r.path.replace(/[/:]+/g, "-").replace(/^-|-$/g, "")}`}
              >
                <h3 className="font-mono text-[15px] font-medium text-ink">
                  <span className="text-accent-ink">{r.method}</span> {r.path}
                </h3>
                <p className="mt-1.5 text-[15px] text-muted">
                  {r.description} Returns{" "}
                  {r.kind === "get"
                    ? `a ${r.returns}`
                    : `a page of ${r.returns}`}
                  .
                </p>
                {r.queryParams.length > 0 && (
                  <ul className="mt-3 space-y-1 text-[14px]">
                    {r.queryParams.map((q) => (
                      <li key={q.name}>
                        <C>{q.name}</C>{" "}
                        <span className="text-muted">
                          {q.type.replace("!", "")}. {q.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4">
                  <RunnableExample
                    origin={origin}
                    method="GET"
                    path={examplePath(r)}
                    sdk={`const prism = new Prism({ key: "${API_KEY_PLACEHOLDER}" });\n${sdkCall(r)}`}
                  />
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section id="sdk" title="TypeScript SDK">
          <p>
            The SDK is generated from the same schema and routes. Download{" "}
            <a
              className="underline decoration-accent decoration-2 underline-offset-4"
              href="/api/sdk"
            >
              prism.ts
            </a>{" "}
            into your project. It has no dependencies, types every resource, and
            retries 429s using <C>Retry-After</C>.
          </p>
          <CodeBlock
            label="Usage"
            code={`import { Prism, PrismError } from "./prism";

const prism = new Prism({ key: process.env.PRISM_KEY! });

const project = await prism.projects.get("YOUR_PROJECT_ID", { include: ["owner"] });
const page = await prism.projects.deployments(project.id, { first: 10 });

try {
  await prism.users.get("usr_missing");
} catch (e) {
  if (e instanceof PrismError) console.log(e.status, e.code);
}`}
          />
        </Section>

        <Section id="errors" title="Errors">
          <p>
            REST and gateway errors share one shape. GraphQL errors follow the
            GraphQL spec, with a code in <C>extensions.code</C>.
          </p>
          <CodeBlock
            code={`{\n  "error": {\n    "code": "rate_limited",\n    "message": "Rate limit exceeded for this key. Retry in 1s.",\n    "docs": "/docs#errors"\n  }\n}`}
          />
          <div className="overflow-x-auto rounded-[14px] border border-line bg-surface">
            <table className="w-full min-w-[480px] text-left text-[14px]">
              <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-2.5 [&_tr:first-child_td]:border-t-0">
                {[
                  [
                    "400",
                    "invalid_parameter, invalid_body",
                    "Fix the request and retry",
                  ],
                  [
                    "401",
                    "missing_key, invalid_key, revoked_key",
                    "Check the key you are sending",
                  ],
                  [
                    "404",
                    "not_found, unknown_route",
                    "The id or route does not exist",
                  ],
                  ["405", "method_not_allowed", "REST is read-only; use GET"],
                  ["429", "rate_limited", "Wait Retry-After seconds"],
                  [
                    "500",
                    "internal",
                    "Retry; include x-request-id if you contact us",
                  ],
                ].map(([s, c, a]) => (
                  <tr key={s}>
                    <td className="font-mono">{s}</td>
                    <td className="font-mono text-[13px]">{c}</td>
                    <td className="text-muted">{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="changes" title="Breaking changes">
          <p>
            Every operation the API receives is recorded by its normalized
            document. In CI, <C>npm run schema:check</C> compares the schema
            with a trusted base revision. When a live operation source is configured, it validates operations seen
            in the last 30 days against the new schema. Without traffic history, all structural breaking changes block. If a change would break
            any of them, the build fails. Unused fields can be removed; used
            ones can’t, until clients stop sending them.
          </p>
        </Section>
      </div>
    </div>
  );
}
