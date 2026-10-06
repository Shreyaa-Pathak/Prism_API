"use client";
import { useEffect, useState } from "react";
import { Dashboard } from "./Dashboard";
import { WorkspacePanel } from "./WorkspacePanel";
import type { Identity } from "@/lib/store/types";

export function AccountDashboard() {
  const [identity, setIdentity] = useState<Identity | null>(null);
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
      sessionStorage.removeItem("prism:lastKey");
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
      sessionStorage.removeItem("prism:lastKey");
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
      <section className="mt-8 max-w-lg rounded-[24px] border border-line bg-surface p-7">
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
            className="rounded-lg bg-ink px-4 py-3 text-surface disabled:opacity-60"
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
      <Dashboard />
    </>
  );
}
