"use client";

import { useEffect, useState } from "react";
import { CodeLines } from "./CodeLines";
import { useSandbox } from "./Sandbox";

const DEFAULT_QUERY = `query ProjectsWithOwners($first: Int) {
  projects(first: $first) {
    edges {
      node {
        name
        owner { name }
        deployments(first: 2) {
          edges { node { id status branch } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

interface Run {
  status: number;
  ms: number;
  dbQueries: string | null;
  remaining: string | null;
  retryAfter: string | null;
  body: string;
}

export function Playground({ sdl }: { sdl: string }) {
  const { demo, stop } = useSandbox();
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [variables, setVariables] = useState('{ "first": 10 }');
  const [key, setKey] = useState("");
  const [batching, setBatching] = useState(true);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [varError, setVarError] = useState<string | null>(null);
  const [showSchema, setShowSchema] = useState(false);
  const requestKey = demo?.key ?? key;
  useEffect(() => { setRun(null); }, [demo]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("prism:lastKey");
      if (saved) setKey(saved);
    } catch {}
  }, []);

  async function execute() {
    let vars: unknown = undefined;
    if (variables.trim()) {
      try {
        vars = JSON.parse(variables);
        setVarError(null);
      } catch {
        setVarError("Variables must be valid JSON.");
        return;
      }
    }
    setRunning(true);
    const t0 = performance.now();
    try {
      const res = await fetch("/graphql", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${requestKey.trim()}`,
          "x-prism-batching": batching ? "on" : "off",
        },
        body: JSON.stringify({ query, variables: vars }),
      });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setRun({
        status: res.status,
        ms: Math.round(performance.now() - t0),
        dbQueries: res.headers.get("x-prism-db-queries"),
        remaining: res.headers.get("x-ratelimit-remaining"),
        retryAfter: res.headers.get("retry-after"),
        body,
      });
    } catch {
      setRun({
        status: 0,
        ms: 0,
        dbQueries: null,
        remaining: null,
        retryAfter: null,
        body: "Network error.",
      });
    } finally {
      setRunning(false);
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      execute();
    }
  };

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <div className="rounded-[16px] border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <label htmlFor="query" className="text-[13px] font-medium">
              Query
            </label>
            <button
              type="button"
              onClick={() => setShowSchema((s) => !s)}
              className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
              aria-expanded={showSchema}
            >
              {showSchema ? "Hide schema" : "Show schema"}
            </button>
          </div>
          <textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            rows={16}
            className="block w-full resize-y bg-bg px-4 py-3 font-mono text-[13px] leading-[1.7] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
          />
          {showSchema && (
            <pre className="max-h-[360px] overflow-auto border-t border-line px-4 py-3 text-[12.5px] leading-[1.7]">
              <CodeLines code={sdl} />
            </pre>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-[16px] border border-line bg-surface">
            <label
              htmlFor="vars"
              className="block border-b border-line px-4 py-2.5 text-[13px] font-medium"
            >
              Variables
            </label>
            <textarea
              id="vars"
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              rows={3}
              className="block w-full resize-y bg-bg px-4 py-3 font-mono text-[13px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
            {varError && (
              <p className="px-4 pb-3 text-[13px] text-warn">{varError}</p>
            )}
          </div>
          <div className="rounded-[16px] border border-line bg-surface">
            <label
              htmlFor="key"
              className="block border-b border-line px-4 py-2.5 text-[13px] font-medium"
            >
              {demo ? "Public sandbox key" : "API key"}
            </label>
            <input
              type="password"
              id="key"
              value={requestKey}
              onChange={(e) => { if (demo) stop(); setKey(e.target.value); }}
              spellCheck={false}
              autoComplete="off"
              className="block w-full bg-bg px-4 py-3 font-mono text-[13px] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
            <a
              href="/dashboard"
              className="block px-4 pb-3 pt-1 text-[13px] text-muted underline"
            >
              Create a workspace API key
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-3 text-[14px]">
            <input
              type="checkbox"
              checked={batching}
              onChange={(e) => setBatching(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent-ink)]"
            />
            DataLoader batching
          </label>
          <button
            type="button"
            onClick={execute}
            disabled={running || !requestKey.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent px-4 text-[14px] font-medium transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3">
              <path d="M3 1.8v8.4L10 6 3 1.8Z" fill="currentColor" />
            </svg>
            {running ? "Running…" : "Run query"}
            <span className="hidden text-[12px] text-ink-2 sm:inline">⌘↵</span>
          </button>
        </div>
      </div>

      <div
        className="min-w-0 rounded-[16px] border border-line bg-surface lg:sticky lg:top-24 lg:self-start"
        aria-live="polite"
      >
        <dl className="grid grid-cols-2 border-b border-line text-[13px] sm:grid-cols-4">
          {[
            ["Status", run ? String(run.status || "—") : "—"],
            ["Time", run ? `${run.ms} ms` : "—"],
            ["DB queries", run?.dbQueries ?? "—"],
            [
              "Tokens left",
              run?.retryAfter
                ? `0, retry in ${run.retryAfter}s`
                : (run?.remaining ?? "—"),
            ],
          ].map(([k, v], i) => (
            <div
              key={k}
              className={`px-4 py-3 ${i % 2 ? "border-l border-line" : ""} ${i > 1 ? "border-t border-line sm:border-t-0 sm:border-l" : ""}`}
            >
              <dt className="text-muted">{k}</dt>
              <dd
                className={`mt-0.5 font-medium tabular-nums ${k === "DB queries" && run?.dbQueries && Number(run.dbQueries) > 5 ? "text-warn" : ""}`}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <pre className="max-h-[640px] min-h-[320px] overflow-auto px-4 py-3.5 text-[12.5px] leading-[1.75]">
          {run ? (
            <CodeLines code={run.body} />
          ) : (
            <span className="text-muted">
              Run the query to see the response.
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}
