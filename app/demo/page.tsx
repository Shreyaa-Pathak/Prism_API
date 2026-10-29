import type { Metadata } from "next";
import Link from "next/link";
import { SandboxControls } from "@/components/Sandbox";
import { RunnableExample } from "@/components/RunnableExample";
import { getOrigin } from "@/lib/origin";

export const metadata: Metadata = { title: "Sandbox demo" };
export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const origin = await getOrigin();
  return (
    <div className="mx-auto max-w-page px-5 py-12 sm:px-8 lg:px-12">
      <p className="text-sm font-medium text-accent-ink">Prism API / Interactive walkthrough</p>
      <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold tracking-[-0.04em]">From API key to useful data.</h1>
      <p className="mt-4 max-w-[65ch] text-lg text-muted">Explore real HTTP requests backed by PostgreSQL. The demo uses three sample projects and nine deployment records in a separate, read-only workspace.</p>
      <SandboxControls />
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section className="min-w-0 space-y-4">
          <h2 className="text-2xl font-medium">1. Read and paginate</h2>
          <p className="text-muted">Run this request, then choose Next page. Inspect the cursor, rate-limit headers, and database query count.</p>
          <RunnableExample origin={origin} method="GET" path="/v1/projects?first=2&include=owner" />
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="text-2xl font-medium">2. Follow a resource</h2>
          <p className="text-muted">Sandbox mode selects a real sample project ID so this request works without editing placeholders.</p>
          <RunnableExample origin={origin} method="GET" path="/v1/projects/YOUR_PROJECT_ID/deployments?first=2" />
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="text-2xl font-medium">3. Compare batching</h2>
          <p className="text-muted">Open the playground and run its default query with batching on, then off. With three sample projects, batching uses 3 resource queries versus 7 without batching. These counts exclude authentication, rate limiting, and telemetry queries.</p>
          <Link href="/playground" className="inline-flex min-h-11 items-center rounded-[10px] bg-ink px-4 text-sm font-medium text-surface">Open playground</Link>
        </section>
        <section className="min-w-0 space-y-4">
          <h2 className="text-2xl font-medium">4. Inspect the contract</h2>
          <p className="text-muted">REST routes, reference docs, and the TypeScript SDK share the GraphQL schema. CI checks the SDK and validates schema compatibility. Public resource APIs are read-only.</p>
          <div className="flex flex-wrap gap-4 text-sm underline underline-offset-4"><Link href="/docs">Runnable docs</Link><a href="/api/sdk">Download SDK</a><a href="/api/schema">GraphQL schema</a></div>
        </section>
      </div>
      <p className="mt-12 max-w-[75ch] text-sm text-muted">The public sandbox shares a token bucket across visitors: burst 10, refill 1 request/second. A 429 response includes Retry-After. Timing shown by examples is measured for your request; it is not a production latency claim.</p>
    </div>
  );
}
