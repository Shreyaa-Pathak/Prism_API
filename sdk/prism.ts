// Prism API TypeScript SDK. Generated from the Prism schema; do not edit by hand.
// Regenerate with `npm run sdk:generate` or download from /api/sdk.

export type DeploymentStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** The user who owns the project. */
  owner: { id: string } & Partial<User>;
}

export interface Deployment {
  id: string;
  status: DeploymentStatus;
  branch: string;
  commit: string;
  createdAt: string;
  /** The project this deployment belongs to. */
  project: { id: string } & Partial<Project>;
}

export interface PageInfo { hasNextPage: boolean; endCursor: string | null }
export interface Page<T> { data: T[]; pageInfo: PageInfo }
export interface ListParams<I extends string = never> { first?: number; after?: string; include?: I[] }
export interface GetParams<I extends string = never> { include?: I[] }

export class PrismError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number, public requestId?: string) {
    super(message);
    this.name = "PrismError";
  }
}

export interface PrismOptions {
  key: string;
  /** Defaults to the origin this SDK was downloaded from. */
  baseUrl?: string;
  /** Retries after 429 responses, honouring Retry-After. Default 3. */
  maxRetries?: number;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | string[] | undefined>;

export class Prism {
  private key: string;
  private baseUrl: string;
  private maxRetries: number;
  private fetchImpl: typeof fetch;

  constructor(opts: PrismOptions) {
    this.key = opts.key;
    this.baseUrl = (opts.baseUrl ?? "https://api.example.com").replace(/\/$/, "");
    this.maxRetries = opts.maxRetries ?? 3;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, query: Query = {}, body?: unknown): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchImpl(url, {
        method,
        headers: { authorization: `Bearer ${this.key}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const retryAfter = Number(res.headers.get("retry-after") ?? 0) || undefined;
      if (res.status === 429 && attempt < this.maxRetries) {
        // Honour Retry-After, back off on repeated 429s, and add jitter so parallel callers spread out.
        await new Promise((r) => setTimeout(r, (retryAfter ?? 1) * 1000 * (attempt + 1) + Math.random() * 250));
        continue;
      }
      const json = await res.json();
      if (!res.ok) {
        throw new PrismError(res.status, json?.error?.code ?? "unknown", json?.error?.message ?? res.statusText, retryAfter, res.headers.get("x-request-id") ?? undefined);
      }
      return json as T;
    }
  }

  /** Run any GraphQL operation against the same schema. */
  graphql<T = unknown>(query: string, variables?: Record<string, unknown>) {
    return this.request<{ data: T | null; errors?: { message: string }[] }>("POST", "/graphql", {}, { query, variables });
  }

  readonly deployments = {
    /** Fetch a deployment by id. `GET /v1/deployments/:id` */
    get: async (id: string, params: GetParams<"project"> = {}) => (await this.request<{ data: Deployment }>("GET", `/v1/deployments/${encodeURIComponent(id)}`, { ...params })).data,
  };

  readonly projects = {
    /** List projects, newest first. `GET /v1/projects` */
    list: (params: ListParams<"owner"> = {}) => this.request<Page<Project>>("GET", `/v1/projects`, { ...params }),
    /** Fetch a project by id. `GET /v1/projects/:id` */
    get: async (id: string, params: GetParams<"owner"> = {}) => (await this.request<{ data: Project }>("GET", `/v1/projects/${encodeURIComponent(id)}`, { ...params })).data,
    /** Deployments for this project, newest first. `GET /v1/projects/:id/deployments` */
    deployments: (id: string, params: ListParams<"project"> = {}) => this.request<Page<Deployment>>("GET", `/v1/projects/${encodeURIComponent(id)}/deployments`, { ...params }),
  };

  readonly users = {
    /** Fetch a user by id. `GET /v1/users/:id` */
    get: async (id: string, params: GetParams<never> = {}) => (await this.request<{ data: User }>("GET", `/v1/users/${encodeURIComponent(id)}`, { ...params })).data,
  };

}
