"use client";
import { useCallback, useEffect, useState } from "react";
import { Dashboard } from "./Dashboard";
import { useSandbox } from "./Sandbox";
import { WorkspacePanel } from "./WorkspacePanel";
import type { Identity } from "@/lib/store/types";

export function AccountDashboard() {
  const { setKey, stop } = useSandbox();
  const [identity, setIdentity] = useState<Identity | null>(null);
  // A key or sandbox from a previous account must not carry over.
  const resetTab = useCallback(() => {
    setKey("");
    stop();
  }, [setKey, stop]);
  const signedOut = useCallback(() => {
    resetTab();
    setIdentity(null);
    setError("Your session ended. Sign in again.");
  }, [resetTab]);
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error?.message);
        setIdentity(body.identity);
      })
      .catch(() =>
        setError(
          "Could not connect to Prism. Check the database configuration.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error?.message ?? "Could not sign in.");
      resetTab();
      setIdentity(b.identity);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Could not sign out. Try again.");
      resetTab();
      setIdentity(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p className="mt-8 text-muted">Loading account…</p>;
  if (!identity)
    return (
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section className="rounded-[24px] border border-line bg-surface p-6 sm:p-8 lg:col-span-6 xl:col-span-5">
        <h2 className="text-2xl font-medium">
          {register ? "Create your workspace" : "Sign in to Prism"}
        </h2>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {register && (
            <label className="block">
              Name
              <input
                name="name"
                required
                maxLength={100}
                autoComplete="name"
                className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"
              />
            </label>
          )}
          <label className="block">
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"
            />
          </label>
          <label className="block">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete={register ? "new-password" : "current-password"}
              className="mt-1 block w-full rounded-lg border border-line bg-bg p-3"
            />
          </label>
          <p className="text-sm text-muted">Use at least 12 characters.</p>
          {error && (
            <p role="alert" className="text-warn">
              {error}
            </p>
          )}
          <button
            disabled={busy}
            className="min-h-11 w-full rounded-[10px] bg-ink px-4 text-[15px] font-medium text-surface transition-colors hover:bg-ink-2 disabled:opacity-60 sm:w-auto"
          >
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
          className="mt-4 text-sm underline"
        >
          {register
            ? "Already have an account? Sign in"
            : "New to Prism? Create an account"}
        </button>
      </section>
      <aside
        aria-label="What you get"
        className="rounded-[24px] bg-accent-light p-6 sm:p-8 lg:col-span-6 xl:col-span-7"
      >
        <h2 className="text-[1.375rem] font-medium tracking-[-0.02em]">
          From sign-up to first request in a minute
        </h2>
        <ol className="mt-6 space-y-5">
          {[
            ["Create your workspace", "Every account starts with its own private, empty workspace."],
            ["Add a project and an API key", "Keys are shown once and stored only as a hash. Up to 5 active keys."],
            ["Call the API", "Use REST, GraphQL or the generated TypeScript SDK, then watch usage and rate limits here."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface font-mono text-[13px] font-medium text-accent-ink">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-7 border-t border-accent-soft pt-5 text-[14px] text-ink-2">
          Just looking?{" "}
          <a href="/demo" className="font-medium text-ink underline underline-offset-4">
            Try the public sandbox
          </a>{" "}
          without an account.
        </p>
      </aside>
      </div>
    );
  return (
    <>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warm p-4">
        <div>
          <p className="font-medium">{identity.workspaceName}</p>
          <p className="text-sm text-muted">{identity.email}</p>
        </div>
        <button
          onClick={logout}
          disabled={busy}
          className="rounded-lg border border-line px-4 py-2"
        >
          Sign out
        </button>
        {error && (
          <p role="alert" className="text-warn">
            {error}
          </p>
        )}
      </div>
      <WorkspacePanel />
      <Dashboard onSignedOut={signedOut} />
    </>
  );
}
