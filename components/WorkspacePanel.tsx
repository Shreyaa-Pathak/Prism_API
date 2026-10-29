"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeploymentRow, ProjectRow } from "@/lib/store/types";
const inputClass = "mt-1 block w-full rounded-lg border border-line bg-bg p-3";
export function WorkspacePanel() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState("");
  const [deployments, setDeployments] = useState<DeploymentRow[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [deploymentCursor, setDeploymentCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // The project whose deployments are on screen; responses for any other project are dropped.
  const selected = useRef("");
  // Guards "Load more" against double clicks sending the same cursor twice.
  const pending = useRef({ projects: false, deployments: false });
  const loadProjects = useCallback(async (after?: string) => {
    if (after && pending.current.projects) return;
    if (after) {
      pending.current.projects = true;
      setLoadingMore(true);
    }
    try {
      const r = await fetch(
        `/api/workspace${after ? `?after=${encodeURIComponent(after)}` : ""}`,
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message);
      const rows = b.edges.map((e: { node: ProjectRow }) => e.node);
      setProjects((p) => (after ? [...p, ...rows] : rows));
      setProjectCursor(b.pageInfo.hasNextPage ? b.pageInfo.endCursor : null);
    } catch (e) {
      setError((e as Error).message || "Could not load projects.");
    } finally {
      if (after) {
        pending.current.projects = false;
        setLoadingMore(false);
      }
    }
  }, []);
  const loadDeployments = useCallback(async (id: string, after?: string) => {
    if (after && pending.current.deployments) return;
    if (after) {
      pending.current.deployments = true;
      setLoadingMore(true);
    }
    try {
      const r = await fetch(
        `/api/workspace?projectId=${encodeURIComponent(id)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      );
      const b = await r.json();
      if (id !== selected.current) return;
      if (!r.ok) throw new Error(b.error?.message);
      const rows = b.edges.map((e: { node: DeploymentRow }) => e.node);
      setDeployments((p) => (after ? [...p, ...rows] : rows));
      setDeploymentCursor(b.pageInfo.hasNextPage ? b.pageInfo.endCursor : null);
    } catch (e) {
      if (id === selected.current)
        setError((e as Error).message || "Could not load deployments.");
    } finally {
      if (after) {
        pending.current.deployments = false;
        setLoadingMore(false);
      }
    }
  }, []);
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    selected.current = projectId;
    pending.current.deployments = false;
    setDeployments([]);
    setDeploymentCursor(null);
    if (projectId) void loadDeployments(projectId);
  }, [projectId, loadDeployments]);
  async function create(
    e: React.FormEvent<HTMLFormElement>,
    deployment = false,
  ) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      const r = await fetch(
        deployment ? "/api/workspace/deployments" : "/api/workspace",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...body,
            ...(deployment ? { projectId } : {}),
          }),
        },
      );
      const b = await r.json();
      if (!r.ok) throw new Error(b.error?.message ?? "Could not save.");
      form.reset();
      if (deployment) await loadDeployments(projectId);
      else {
        await loadProjects();
        setProjectId(b.data.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-[24px] border border-line bg-surface p-5 sm:p-7">
      <h2 className="text-2xl font-medium">Your projects</h2>
      {error && (
        <p role="alert" className="mt-3 text-warn">
          {error}
        </p>
      )}
      <div className="mt-5 grid gap-7 lg:grid-cols-2">
        <div>
          <form onSubmit={(e) => create(e)} className="space-y-3">
            <label className="block text-sm">
              Project name
              <input
                required
                name="name"
                maxLength={100}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              Slug
              <input
                required
                name="slug"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={100}
                placeholder="my-project"
                className={inputClass}
              />
            </label>
            <button
              disabled={busy}
              className="rounded-lg bg-ink px-4 py-3 text-sm text-surface disabled:opacity-60"
            >
              Create project
            </button>
          </form>
          <ul className="mt-5 divide-y divide-line">
            {projects.map((p) => (
              <li key={p.id} className="py-3">
                <button
                  onClick={() => setProjectId(p.id)}
                  aria-pressed={projectId === p.id}
                  className="text-left"
                >
                  <span className="font-medium">{p.name}</span>
                  <code className="mt-1 block break-all text-xs text-muted">
                    {p.id}
                  </code>
                </button>
              </li>
            ))}
          </ul>
          {!projects.length && (
            <p className="mt-5 text-sm text-muted">
              Your workspace is empty. Create your first project.
            </p>
          )}
          {projectCursor && (
            <button
              onClick={() => loadProjects(projectCursor)}
              disabled={loadingMore}
              className="mt-3 underline disabled:opacity-60"
            >
              Load more projects
            </button>
          )}
        </div>
        <div>
          <h3 className="text-lg font-medium">Deployment history</h3>
          <p className="mt-2 text-sm text-muted">
            Select a project to view or record deployments. Prism stores
            history; it does not run builds.
          </p>
          {projectId && (
            <>
              <form
                onSubmit={(e) => create(e, true)}
                className="mt-4 space-y-3"
              >
                <label className="block text-sm">
                  Status
                  <select name="status" className={inputClass}>
                    {["QUEUED", "BUILDING", "READY", "FAILED"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Branch
                  <input
                    required
                    name="branch"
                    maxLength={200}
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  Commit
                  <input
                    required
                    name="commit"
                    maxLength={100}
                    className={inputClass}
                  />
                </label>
                <button
                  disabled={busy}
                  className="rounded-lg bg-ink px-4 py-3 text-sm text-surface disabled:opacity-60"
                >
                  Record deployment
                </button>
              </form>
              <ul className="mt-5 divide-y divide-line">
                {deployments.map((d) => (
                  <li key={d.id} className="py-3 text-sm">
                    <p>
                      {d.status} · {d.branch} · {d.commit}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(d.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
              {!deployments.length && (
                <p className="mt-4 text-sm text-muted">
                  No deployments recorded yet.
                </p>
              )}
              {deploymentCursor && (
                <button
                  onClick={() => loadDeployments(projectId, deploymentCursor)}
                  disabled={loadingMore}
                  className="mt-3 underline disabled:opacity-60"
                >
                  Load more deployments
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
