import Link from "next/link";
import { RunnableExample } from "@/components/RunnableExample";
import { restRoutes } from "@/graphql/rest";
import { PLANS } from "@/lib/ratelimit";
import { getOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export default async function Home() {
  const origin = await getOrigin();
  return (
    <div className="mx-auto max-w-page px-5 sm:px-8 lg:px-12">
      <section className="grid grid-cols-1 items-center gap-12 py-14 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-24">
        <div className="min-w-0 lg:col-span-5">
          <h1 className="text-[clamp(3rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.05em]">
            Prism API
          </h1>
          <p className="mt-6 max-w-[32ch] text-balance text-[1.375rem] leading-[1.3] tracking-[-0.015em] text-ink-2 sm:text-[1.5rem]">
            A public GraphQL and REST platform with keys, docs and limits
            developers actually enjoy.
          </p>
          <p className="mt-5 max-w-[50ch] text-[17px] leading-relaxed text-muted">
            Read your projects, owners and deployments with a key instead of
            scraping the dashboard. The request on the right runs against this
            server.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="inline-flex min-h-12 items-center rounded-[12px] bg-ink px-5 text-[15px] font-medium text-surface transition-colors hover:bg-ink-2"
            >
              Try the sandbox
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-12 items-center rounded-[12px] border border-accent bg-accent px-5 text-[15px] font-medium transition-colors hover:border-ink"
            >
              Create an API key
            </Link>
            <Link
              href="/docs"
              className="inline-flex min-h-12 items-center rounded-[12px] border border-line bg-surface px-5 text-[15px] font-medium transition-colors hover:border-ink"
            >
              Read the docs
            </Link>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <RunnableExample
            origin={origin}
            method="GET"
            path="/v1/projects?first=2&include=owner"
            sdk={`import { Prism } from "./prism";\n\nconst prism = new Prism({ key: process.env.PRISM_KEY! });\nconst page = await prism.projects.list({ first: 2, include: ["owner"] });`}
          />
        </div>
      </section>

      <section
        aria-label="What you get"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        <article className="rounded-[24px] border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-[1.5rem] font-medium tracking-[-0.02em]">
            One schema, two APIs
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            The {restRoutes.length} REST routes and the TypeScript SDK are
            generated from the GraphQL schema at runtime, so they can’t drift
            from it.
          </p>
          <ul className="mt-5 space-y-1.5 font-mono text-[12.5px]">
            {restRoutes.map((r) => (
              <li
                key={r.path}
                className="truncate rounded-[8px] bg-bg px-3 py-1.5"
              >
                <span className="text-accent-ink">{r.method}</span> {r.path}
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-[24px] bg-accent-light p-6 sm:p-8">
          <h2 className="text-[1.5rem] font-medium tracking-[-0.02em]">
            Fair rate limits
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            A token bucket per key. Every response says how many tokens are
            left, and a 429 says exactly when to retry.
          </p>
          <table className="mt-5 w-full text-left text-[14px]">
            <thead className="text-muted">
              <tr>
                <th className="pb-2 font-normal">Plan</th>
                <th className="pb-2 font-normal">Burst</th>
                <th className="pb-2 font-normal">Refill</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(PLANS).map((p) => (
                <tr key={p.label} className="border-t border-accent-soft">
                  <td className="py-2 font-medium">{p.label}</td>
                  <td className="py-2 tabular-nums">{p.capacity} requests</td>
                  <td className="py-2 tabular-nums">
                    {p.refillPerSec} / second
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="rounded-[24px] bg-warm p-6 sm:p-8">
          <h2 className="text-[1.5rem] font-medium tracking-[-0.02em]">
            Docs you can run
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Run examples with public sample data or your own workspace key.
            Try a query in the playground with batching on and
            off.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/docs"
              className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 text-[14px] font-medium text-surface hover:bg-ink-2"
            >
              Open the docs
            </Link>
            <Link
              href="/playground"
              className="inline-flex min-h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-[14px] font-medium hover:border-ink"
            >
              Playground
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}
