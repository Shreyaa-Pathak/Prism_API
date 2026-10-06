import { getNamedType, isEnumType, isLeafType, isNonNullType, isObjectType, type GraphQLObjectType } from "graphql";
import { schema } from "./schema";
import { leafTsType, restRoutes, type RestRoute } from "./rest";

const isConnectionish = (n: string) => /(Connection|Edge)$/.test(n) || n === "PageInfo" || n === "Query" || n.startsWith("__");
const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** Generates the TypeScript SDK from the same schema and REST routes the server uses. */
export function generateSdk(): string {
  const out: string[] = [
    "// Prism API TypeScript SDK. Generated from the Prism schema; do not edit by hand.",
    "// Regenerate with `npm run sdk:generate` or download from /api/sdk.",
    "",
  ];

  for (const t of Object.values(schema.getTypeMap())) {
    if (t.name.startsWith("__")) continue;
    if (isEnumType(t)) out.push(`export type ${t.name} = ${t.getValues().map((v) => JSON.stringify(v.name)).join(" | ")};`, "");
  }

  for (const t of Object.values(schema.getTypeMap())) {
    if (!isObjectType(t) || isConnectionish(t.name)) continue;
    out.push(`export interface ${t.name} {`);
    for (const f of Object.values((t as GraphQLObjectType).getFields())) {
      const nt = getNamedType(f.type);
      const nullable = isNonNullType(f.type) ? "" : " | null";
      const doc = f.description ? [`  /** ${f.description} */`] : [];
      if (isEnumType(nt)) out.push(...doc, `  ${f.name}: ${nt.name}${nullable};`);
      else if (isLeafType(nt)) out.push(...doc, `  ${f.name}: ${leafTsType(nt.name)}${nullable};`);
      else if (isObjectType(nt) && !isConnectionish(nt.name)) out.push(...doc, `  ${f.name}: { id: string } & Partial<${nt.name}>${nullable};`);
    }
    out.push("}", "");
  }

  out.push(
    "export interface PageInfo { hasNextPage: boolean; endCursor: string | null }",
    "export interface Page<T> { data: T[]; pageInfo: PageInfo }",
    "export interface ListParams<I extends string = never> { first?: number; after?: string; include?: I[] }",
    "export interface GetParams<I extends string = never> { include?: I[] }",
    "",
    "export class PrismError extends Error {",
    "  constructor(public status: number, public code: string, message: string, public retryAfter?: number, public requestId?: string) {",
    "    super(message);",
    '    this.name = "PrismError";',
    "  }",
    "}",
    "",
    "export interface PrismOptions {",
    "  key: string;",
    "  /** Defaults to the origin this SDK was downloaded from. */",
    "  baseUrl?: string;",
    "  /** Retries after 429 responses, honouring Retry-After. Default 3. */",
    "  maxRetries?: number;",
    "  fetch?: typeof fetch;",
    "}",
    "",
    "type Query = Record<string, string | number | string[] | undefined>;",
    "",
    "export class Prism {",
    "  private key: string;",
    "  private baseUrl: string;",
    "  private maxRetries: number;",
    "  private fetchImpl: typeof fetch;",
    "",
    "  constructor(opts: PrismOptions) {",
    "    this.key = opts.key;",
    '    this.baseUrl = (opts.baseUrl ?? "__BASE_URL__").replace(/\\/$/, "");',
    "    this.maxRetries = opts.maxRetries ?? 3;",
    "    this.fetchImpl = opts.fetch ?? fetch;",
    "  }",
    "",
    "  private async request<T>(method: string, path: string, query: Query = {}, body?: unknown): Promise<T> {",
    "    const url = new URL(this.baseUrl + path);",
    "    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, Array.isArray(v) ? v.join(\",\") : String(v));",
    "    for (let attempt = 0; ; attempt++) {",
    "      const res = await this.fetchImpl(url, {",
    "        method,",
    '        headers: { authorization: `Bearer ${this.key}`, ...(body ? { "content-type": "application/json" } : {}) },',
    "        body: body ? JSON.stringify(body) : undefined,",
    "      });",
    '      const retryAfter = Number(res.headers.get("retry-after") ?? 0) || undefined;',
    "      if (res.status === 429 && attempt < this.maxRetries) {",
    "        // Honour Retry-After, back off on repeated 429s, and add jitter so parallel callers spread out.",
    "        await new Promise((r) => setTimeout(r, (retryAfter ?? 1) * 1000 * (attempt + 1) + Math.random() * 250));",
    "        continue;",
    "      }",
    "      const json = await res.json();",
    "      if (!res.ok) {",
    '        throw new PrismError(res.status, json?.error?.code ?? "unknown", json?.error?.message ?? res.statusText, retryAfter, res.headers.get("x-request-id") ?? undefined);',
    "      }",
    "      return json as T;",
    "    }",
    "  }",
    "",
    "  /** Run any GraphQL operation against the same schema. */",
    "  graphql<T = unknown>(query: string, variables?: Record<string, unknown>) {",
    '    return this.request<{ data: T | null; errors?: { message: string }[] }>("POST", "/graphql", {}, { query, variables });',
    "  }",
    "",
  );

  const groups = new Map<string, RestRoute[]>();
  for (const r of restRoutes) groups.set(r.resource, [...(groups.get(r.resource) ?? []), r]);
  for (const [resource, routes] of groups) {
    out.push(`  readonly ${camel(resource)} = {`);
    for (const r of routes) {
      const inc = r.includes.length ? r.includes.map((i) => JSON.stringify(i)).join(" | ") : "never";
      const path = r.path.replace(":id", "${encodeURIComponent(id)}");
      out.push(`    /** ${r.description} \`${r.method} ${r.path}\` */`);
      if (r.kind === "list") {
        out.push(`    ${camel(r.action)}: (params: ListParams<${inc}> = {}) => this.request<Page<${r.returns}>>("GET", \`${path}\`, { ...params }),`);
      } else if (r.kind === "get") {
        out.push(`    ${camel(r.action)}: async (id: string, params: GetParams<${inc}> = {}) => (await this.request<{ data: ${r.returns} }>("GET", \`${path}\`, { ...params })).data,`);
      } else {
        out.push(`    ${camel(r.action)}: (id: string, params: ListParams<${inc}> = {}) => this.request<Page<${r.returns}>>("GET", \`${path}\`, { ...params }),`);
      }
    }
    out.push("  };", "");
  }
  out.push("}", "");
  return out.join("\n");
}
