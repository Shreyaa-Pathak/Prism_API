"use client";

import { useEffect, useRef, useState } from "react";
import { CodeLines } from "./CodeLines";
import { sandboxPath, useSandbox } from "./Sandbox";

export const API_KEY_PLACEHOLDER = "<API_KEY>";

interface Props {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Send your workspace key. Turn off to see the 401. */
  auth?: boolean;
  /** Fire this many requests back to back, to show rate limiting. */
  burst?: number;
  sdk?: string;
  origin: string;
}

interface Result {
  status: number;
  ms: number;
  headers: [string, string][];
  body: string;
  burst?: number[];
}

const SHOWN = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "retry-after",
  "x-prism-db-queries",
  "x-response-time",
];

export function RunnableExample({
  method,
  path,
  body,
  auth = true,
  burst,
  sdk,
  origin,
}: Props) {
  const { demo, key, setKey, start, loading } = useSandbox();
  const [tab, setTab] = useState<"curl" | "sdk">("curl");
  const [currentPath, setCurrentPath] = useState(path);
  const [state, setState] = useState<
    "idle" | "running" | "done" | "error" | "invalid"
  >("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Bumped on every run and mode switch; responses from an older run are dropped.
  const runId = useRef(0);
  const requestPath = sandboxPath(currentPath, demo);
  const requestKey = demo?.key ?? key;
  const displaySdk = sdk ? sandboxPath(sdk, demo).replaceAll(API_KEY_PLACEHOLDER, demo?.key ?? API_KEY_PLACEHOLDER) : undefined;
  useEffect(() => {
    runId.current++;
    setCurrentPath(path);
    setNextCursor(null);
    setResult(null);
    setState("idle");
  }, [demo, path]);

  const curl = [
    `curl${method === "POST" ? " -X POST" : ""} "${origin}${requestPath}"`,
    ...(auth ? [`  -H "Authorization: Bearer ${demo?.key ?? API_KEY_PLACEHOLDER}"`] : []),
    ...(body
      ? [
          `  -H "Content-Type: application/json"`,
          `  -d '${JSON.stringify(body)}'`,
        ]
      : []),
  ].join(" \\\n");

  async function call(p: string) {
    const t0 = performance.now();
    const res = await fetch(p, {
      method,
      headers: {
        ...(auth ? { authorization: `Bearer ${requestKey.trim()}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { res, text, ms: Math.round(performance.now() - t0) };
  }

  async function run(p = requestPath) {
    // Never send a pasted key to an arbitrary URL through the editable example path.
    if (
      (!p.startsWith("/v1/") && p !== "/graphql") ||
      p.includes("\\") ||
      p.startsWith("//")
    ) {
      setResult(null);
      return setState("invalid");
    }
    const id = ++runId.current;
    setState("running");
    try {
      const statuses: number[] = [];
      let last = await call(p);
      statuses.push(last.res.status);
      for (let i = 1; i < (burst ?? 1) && id === runId.current; i++) {
        last = await call(p);
        statuses.push(last.res.status);
      }
      if (id !== runId.current) return;
      let pretty = last.text;
      let cursor: string | null = null;
      try {
        const parsed = JSON.parse(last.text);
        pretty = JSON.stringify(parsed, null, 2);
        cursor = parsed?.pageInfo?.hasNextPage
          ? parsed.pageInfo.endCursor
          : null;
      } catch {}
      setNextCursor(method === "GET" ? cursor : null);
      setResult({
        status: last.res.status,
        ms: last.ms,
        headers: SHOWN.flatMap((h) =>
          last.res.headers.get(h)
            ? [[h, last.res.headers.get(h)!] as [string, string]]
            : [],
        ),
        body: pretty,
        burst: burst ? statuses : undefined,
      });
      setState("done");
    } catch {
      if (id === runId.current) setState("error");
    }
  }

  function nextPage() {
    if (!nextCursor) return;
    const url = new URL(requestPath, "http://x");
    url.searchParams.set("after", nextCursor);
    const p = url.pathname + url.search;
    setCurrentPath(p);
    run(p);
  }

  const ok = result && result.status < 400;

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="rounded-[6px] bg-accent-light px-2 py-0.5 font-mono font-medium text-accent-ink">
            {method}
          </span>
          <span className="truncate font-mono text-ink-2">{requestPath}</span>
        </div>
        {sdk && (
          <div
            role="group"
            aria-label="Example language"
            className="flex rounded-[9px] border border-line bg-bg p-0.5"
          >
            {(["curl", "sdk"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-8 rounded-[7px] px-2.5 text-[12.5px] font-medium ${tab === t ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}
              >
                {t === "curl" ? "cURL" : "TypeScript"}
              </button>
            ))}
          </div>
        )}
      </div>

      {auth && (
        <div className="space-y-3 border-b border-line px-4 py-3 text-sm">
          <label className="block">
            {demo ? "Public sandbox key" : "Your API key"}
            <input
              type="password"
              autoComplete="off"
              value={requestKey}
              readOnly={!!demo}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste a key from your dashboard"
              className="mt-1 block w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs read-only:text-muted"
            />
          </label>
          {demo && (
            <p className="text-[12.5px] text-muted">
              Choose “Use my own key” above to switch back to your key.
            </p>
          )}
          <label className="block">
            Request path
            <input
              value={requestPath}
              onChange={(e) => {
                setCurrentPath(e.target.value);
                setNextCursor(null);
              }}
              className="mt-1 block w-full rounded-lg border border-line bg-bg p-2 font-mono text-xs"
            />
          </label>
        </div>
      )}
      <pre className="overflow-x-auto bg-bg px-4 py-3.5 text-[12.5px] leading-[1.75]">
        <CodeLines code={tab === "sdk" && displaySdk ? displaySdk : curl} />
      </pre>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        {auth && !demo && !key.trim() && state === "idle" ? (
          <span className="text-[13px] text-muted">
            No key yet?{" "}
            <button
              type="button"
              onClick={() => void start()}
              disabled={loading}
              className="font-medium text-ink underline decoration-line-dark underline-offset-4 hover:decoration-ink disabled:opacity-60"
            >
              {loading ? "Loading sandbox…" : "Try it with the sandbox"}
            </button>{" "}
            or paste one above.
          </span>
        ) : (
        <span className="text-[13px] text-muted">
          {state === "running"
            ? "Running…"
            : state === "error"
              ? "Network error. Is the server running?"
              : state === "invalid"
                ? "Use a Prism API path (/v1/… or /graphql)."
                : result
                ? `${result.status} in ${result.ms} ms`
                : auth
                  ? demo ? "Runs against public sample data" : "Runs against your workspace with your API key"
                  : "Runs without a key"}
        </span>
        )}
        <div className="flex gap-2">
          {nextCursor && state === "done" && (
            <button
              type="button"
              onClick={nextPage}
              className="min-h-10 whitespace-nowrap rounded-[10px] border border-line bg-surface px-3.5 text-[14px] font-medium hover:border-ink"
            >
              Next page
            </button>
          )}
          <button
            type="button"
            onClick={() => run()}
            disabled={state === "running" || (auth && !requestKey.trim())}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-[10px] bg-accent px-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3">
              <path d="M3 1.8v8.4L10 6 3 1.8Z" fill="currentColor" />
            </svg>
            {burst ? `Send ${burst} requests` : result ? "Run again" : "Run"}
          </button>
        </div>
      </div>

      {result && (
        <div className="border-t border-line" aria-live="polite">
          {result.burst && (
            <ol
              aria-label="Burst results"
              className="flex flex-wrap gap-1.5 px-4 pt-3.5"
            >
              {result.burst.map((s, i) => (
                <li
                  key={i}
                  className={`rounded-[6px] px-2 py-0.5 font-mono text-[12px] ${s < 400 ? "bg-accent-light text-accent-ink" : "bg-blush text-warn"}`}
                >
                  {s}
                </li>
              ))}
            </ol>
          )}
          {result.headers.length > 0 && (
            <dl className="grid gap-x-6 gap-y-1 px-4 pt-3.5 font-mono text-[12px] sm:grid-cols-2">
              {result.headers.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted">{k}:</dt>
                  <dd className={k === "retry-after" ? "text-warn" : ""}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <pre
            className={`max-h-[420px] overflow-auto px-4 py-3.5 text-[12.5px] leading-[1.75] ${ok ? "" : "bg-[rgba(246,222,218,0.35)]"}`}
          >
            <CodeLines code={result.body} />
          </pre>
        </div>
      )}
    </div>
  );
}
