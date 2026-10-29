"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { SandboxDemo } from "@/lib/sandbox";

const SandboxContext = createContext<{
  demo: SandboxDemo | null;
  loading: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
} | null>(null);

export function SandboxProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<SandboxDemo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sandbox", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Sandbox unavailable.");
      setDemo(body);
      try { sessionStorage.setItem("prism:sandbox", "active"); } catch {}
    } catch (error) {
      setDemo(null);
      setError(error instanceof Error ? error.message : "Sandbox unavailable.");
      try { sessionStorage.removeItem("prism:sandbox"); } catch {}
    } finally { setLoading(false); }
  }, []);
  const stop = () => {
    setDemo(null);
    setError(null);
    try { sessionStorage.removeItem("prism:sandbox"); } catch {}
  };
  useEffect(() => {
    try { if (sessionStorage.getItem("prism:sandbox") === "active") void start(); } catch {}
  }, [start]);
  return <SandboxContext.Provider value={{ demo, loading, error, start, stop }}>{children}</SandboxContext.Provider>;
}

export function useSandbox() {
  const context = useContext(SandboxContext);
  if (!context) throw new Error("SandboxProvider is required.");
  return context;
}

export function sandboxPath(path: string, demo: SandboxDemo | null) {
  if (!demo) return path;
  return path.replaceAll("YOUR_PROJECT_ID", demo.projectId)
    .replaceAll("YOUR_USER_ID", demo.userId)
    .replaceAll("YOUR_DEPLOYMENT_ID", demo.deploymentId);
}

export function SandboxControls() {
  const { demo, loading, error, start, stop } = useSandbox();
  return (
    <aside className="my-6 rounded-[16px] border border-line bg-accent-light p-5" aria-label="Sandbox demo">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">{demo ? "Sandbox is active" : "Explore without an account"}</p>
          <p className="mt-1 max-w-[62ch] text-sm text-ink-2">{demo ? "Examples use public sample projects and deployments. The shared sandbox is read-only and rate limited." : "Load a public sandbox key and sample records for the docs and GraphQL playground."}</p>
        </div>
        <button type="button" disabled={loading} onClick={demo ? stop : () => void start()} className="min-h-11 rounded-[10px] bg-ink px-4 text-sm font-medium text-surface disabled:opacity-60">
          {loading ? "Loading sandbox…" : demo ? "Use my own key" : "Try sandbox"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-warn">{error}</p>}
    </aside>
  );
}
