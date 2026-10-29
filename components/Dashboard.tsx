"use client";

import { useCallback, useEffect, useState } from "react";
import { useSandbox } from "./Sandbox";

interface Key {
  id: string;
  name: string;
  prefix: string;
  plan: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
interface Summary {
  total: number;
  ok: number;
  limited: number;
  errors: number;
  p50: number | null;
  p99: number | null;
  hourly: { hour: string; ok: number; limited: number; errors: number }[];
  routes: { route: string; count: number }[];
  averageMs: number | null;
  byKey: { keyId: string; count: number }[];
}
interface Bucket {
  keyId: string;
  capacity: number;
  refillPerSec: number;
  remaining: number;
  label: string;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

// Same display prefix as lib/keys.ts, so a stored secret can be matched to its key record.
const prefixOf = (secret: string) =>
  `${secret.slice(0, 12)}…${secret.slice(-4)}`;

export function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const { key: tabKey, setKey: setTabKey, stop: stopSandbox } = useSandbox();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, u] = await Promise.all(
        ["/api/keys", "/api/usage"].map(async (path) => {
          const r = await fetch(path);
          if (r.status === 401) throw new Error("signed_out");
          if (!r.ok) throw new Error("Could not load workspace data.");
          return r.json();
        }),
      );
      setKeys(k.keys);
      setSummary(u.summary);
      setBuckets(u.buckets);
      setLoadError(null);
    } catch (e) {
      if ((e as Error).message === "signed_out") return onSignedOut();
      setLoadError("Could not load your keys. Retrying…");
    }
  }, [onSignedOut]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // A revoked key must not stay in the banner or keep prefilling the examples.
  useEffect(() => {
    const revoked = new Set(
      keys?.filter((k) => k.revokedAt).map((k) => k.prefix),
    );
    if (secret && revoked.has(prefixOf(secret.value))) setSecret(null);
    if (tabKey && revoked.has(prefixOf(tabKey))) setTabKey("");
  }, [keys, secret, tabKey, setTabKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body)
        return setError(body?.error?.message ?? "Could not create the key.");
      setSecret({ name: body.key.name, value: body.secret });
      setCopied(false);
      setName("");
      // The new key replaces the sandbox, so the examples really use it.
      setTabKey(body.secret);
      stopSandbox();
      load();
    } catch {
      setError("Could not reach Prism. Check your connection and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(k: Key) {
    if (
      !confirm(
        `Revoke “${k.name}”? Requests using it will start failing with 401.`,
      )
    )
      return;
    try {
      const res = await fetch(`/api/keys/${k.id}`, { method: "DELETE" });
      if (!res.ok) setError("Could not revoke the key.");
    } catch {
      setError("Could not revoke the key.");
    }
    load();
  }

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the key and copy it manually.");
    }
  }

  const peak = Math.max(
    1,
    ...(summary?.hourly.map((h) => h.ok + h.limited + h.errors) ?? [1]),
  );
  const active = keys?.filter((k) => !k.revokedAt) ?? [];

  return (
    <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section
        aria-labelledby="keys-title"
        className="min-w-0 rounded-[24px] border border-line bg-surface p-5 sm:p-7 lg:col-span-7"
      >
        <h2
          id="keys-title"
          className="text-[1.375rem] font-medium tracking-[-0.02em]"
        >
          API keys
        </h2>

        <form
          onSubmit={create}
          className="mt-5 flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="key-name" className="sr-only">
            Key name
          </label>
          <input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name, e.g. Production sync"
            maxLength={60}
            required
            className="min-h-11 flex-1 rounded-[10px] border border-line bg-bg px-3.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
          />
          <button
            type="submit"
            disabled={creating}
            className="min-h-11 rounded-[10px] bg-ink px-4 text-[14px] font-medium text-surface hover:bg-ink-2 disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create key"}
          </button>
        </form>
        {(error ?? loadError) && (
          <p role="alert" className="mt-3 text-[14px] text-warn">
            {error ?? loadError}
          </p>
        )}

        {secret && (
          <div
            className="mt-5 rounded-[14px] border border-accent bg-accent-light p-4"
            role="status"
          >
            <p className="text-[14px] font-medium">
              Copy “{secret.name}” now. You won’t see this key again.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[8px] bg-surface px-3 py-2.5 font-mono text-[13px]">
                {secret.value}
              </code>
              <button
                type="button"
                onClick={copy}
                className="min-h-11 rounded-[8px] border border-line bg-surface px-4 text-[14px] font-medium hover:border-ink"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[13px] text-ink-2">
              It’s also loaded into the{" "}
              <a className="underline underline-offset-4" href="/playground">
                playground
              </a>{" "}
              for this tab.
            </p>
          </div>
        )}

        <div className="mt-6">
          {keys === null ? (
            <p className="text-[14px] text-muted">Loading keys…</p>
          ) : keys.length === 0 ? (
            <p className="rounded-[14px] bg-bg px-4 py-6 text-[14px] text-muted">
              No keys yet. Name your first key above to start calling the API.
            </p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {keys.map((k) => {
                const b = buckets.find((x) => x.keyId === k.id);
                return (
                  <li
                    key={k.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                        {k.name}
                        <span
                          className={`rounded-[6px] px-2 py-0.5 text-[12px] font-medium ${k.revokedAt ? "bg-blush text-warn" : "bg-accent-light text-accent-ink"}`}
                        >
                          {k.revokedAt
                            ? "Revoked"
                            : k.plan === "standard"
                              ? "Standard"
                              : k.plan}
                        </span>
                      </p>
                      <p className="mt-1 font-mono text-[12.5px] text-muted">
                        {k.prefix}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        Created {fmt(k.createdAt)}. Last used{" "}
                        {fmt(k.lastUsedAt).toLowerCase() === "never"
                          ? "never"
                          : fmt(k.lastUsedAt)}
                        .
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        {summary?.byKey.find((x) => x.keyId === k.id)?.count ??
                          0}{" "}
                        requests in the last 24 hours
                      </p>
                      {b && (
                        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
                          <span
                            aria-hidden
                            className="h-1.5 w-28 overflow-hidden rounded-full bg-accent-light"
                          >
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{
                                width: `${(b.remaining / b.capacity) * 100}%`,
                              }}
                            />
                          </span>
                          {b.remaining} of {b.capacity} tokens
                        </div>
                      )}
                    </div>
                    {!k.revokedAt && (
                      <button
                        type="button"
                        onClick={() => revoke(k)}
                        className="min-h-10 w-fit rounded-[10px] border border-line px-3.5 text-[14px] text-warn hover:border-warn"
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {keys && keys.length > 0 && (
            <p className="mt-3 text-[13px] text-muted">
              {active.length} of 5 active keys.
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby="usage-title"
        className="min-w-0 space-y-4 lg:col-span-5"
      >
        <div className="rounded-[24px] bg-accent-light p-5 sm:p-7">
          <h2
            id="usage-title"
            className="text-[1.375rem] font-medium tracking-[-0.02em]"
          >
            Usage, last 24 hours
          </h2>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["Requests", summary?.total ?? 0],
              ["Rate limited", summary?.limited ?? 0],
              ["Successful", summary?.ok ?? 0],
              ["Failed", summary?.errors ?? 0],
              [
                "Average latency",
                summary?.averageMs != null ? `${summary.averageMs} ms` : "?",
              ],
              ["p50 latency", summary?.p50 != null ? `${summary.p50} ms` : "—"],
              ["p99 latency", summary?.p99 != null ? `${summary.p99} ms` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[14px] bg-surface p-4">
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 rounded-[14px] bg-surface p-4">
            <p className="text-[13px] text-muted">Requests per hour</p>
            <div
              className="mt-3 flex h-28 items-end gap-[3px]"
              role="img"
              aria-label={`Hourly requests over the last 24 hours, peak ${peak}`}
            >
              {summary?.hourly.map((h) => {
                const total = h.ok + h.limited + h.errors;
                return (
                  <div
                    key={h.hour}
                    className="flex h-full flex-1 flex-col justify-end"
                    title={`${new Date(h.hour).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}, ${total} requests`}
                  >
                    {h.limited > 0 && (
                      <div
                        className="bg-warn"
                        style={{ height: `${(h.limited / peak) * 100}%` }}
                      />
                    )}
                    {h.errors > 0 && (
                      <div
                        className="bg-blush"
                        style={{ height: `${(h.errors / peak) * 100}%` }}
                      />
                    )}
                    <div
                      className={`rounded-t-[2px] ${h.ok ? "bg-accent" : "bg-accent-light"}`}
                      style={{ height: `${Math.max(2, (h.ok / peak) * 100)}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-accent" />
                Success
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-blush" />
                Errors
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-warn" />
                429
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-line bg-surface p-5 sm:p-7">
          <h3 className="text-[1.125rem] font-medium">Top routes</h3>
          {summary && summary.routes.length ? (
            <ul className="mt-4 space-y-2">
              {summary.routes.map((r) => (
                <li
                  key={r.route}
                  className="flex items-center justify-between gap-3 text-[14px]"
                >
                  <span className="truncate font-mono text-[12.5px]">
                    {r.route}
                  </span>
                  <span className="tabular-nums text-muted">{r.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[14px] text-muted">
              No requests from your keys yet. Try one from the{" "}
              <a className="underline underline-offset-4" href="/docs">
                docs
              </a>{" "}
              with your key.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
