import { hashKey } from "./keys";
import type { PlatformStore } from "./store/types";

export interface SandboxDemo {
  key: string;
  projectId: string;
  userId: string;
  deploymentId: string;
}

/** Only an explicitly provisioned, read-only sample workspace may be advertised. */
export async function describeSandbox(store: PlatformStore, key: string | undefined): Promise<SandboxDemo | null> {
  if (!key || key.length < 24 || /[<>]/.test(key)) return null;
  const workspaceId = await store.sandbox.workspaceForKey(hashKey(key));
  if (!workspaceId) return null;
  const data = store.data(workspaceId);
  const [project] = await data.project.findMany({ take: 1 });
  if (!project) return null;
  const [deployment] = await data.deployment.findMany({ where: { projectId: project.id }, take: 1 });
  if (!deployment) return null;
  return { key, projectId: project.id, userId: project.ownerId, deploymentId: deployment.id };
}
