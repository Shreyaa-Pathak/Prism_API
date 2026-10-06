import {
  getNamedType,
  isEnumType,
  isLeafType,
  isNonNullType,
  isObjectType,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLObjectType,
} from "graphql";
import { schema } from "./schema";

/**
 * REST is generated from the GraphQL schema, never written by hand:
 *   Query field returning a Connection      -> GET /v1/{field}
 *   Query field with an `id` argument        -> GET /v1/{plural}/:id
 *   Connection field on that type            -> GET /v1/{plural}/:id/{field}
 * Each route compiles to a GraphQL document and runs through the same resolvers and DataLoaders.
 */

export interface QueryParam { name: string; type: string; description: string }
export interface RestRoute {
  method: "GET";
  path: string;
  resource: string;
  action: string;
  kind: "list" | "get" | "nested";
  description: string;
  returns: string;
  queryField: string;
  nestedField?: string;
  pathParams: string[];
  queryParams: QueryParam[];
  includes: string[];
}

const isConnection = (t: GraphQLObjectType) => t.name.endsWith("Connection");
const nodeType = (conn: GraphQLObjectType) => {
  const edge = getNamedType(conn.getFields().edges.type) as GraphQLObjectType;
  return getNamedType(edge.getFields().node.type) as GraphQLObjectType;
};
const plural = (s: string) => (s.endsWith("s") ? s : `${s}s`);

/** Object fields that can be expanded with ?include= (non-connection, no required args). */
export function relationsOf(type: GraphQLObjectType) {
  return Object.values(type.getFields())
    .filter((f) => {
      const t = getNamedType(f.type);
      return isObjectType(t) && !isConnection(t) && f.args.every((a) => !isNonNullType(a.type));
    })
    .map((f) => f.name);
}

function selection(type: GraphQLObjectType, include: Set<string>, depth = 0): string {
  const parts: string[] = [];
  for (const f of Object.values(type.getFields())) {
    const t = getNamedType(f.type);
    if (isLeafType(t)) parts.push(f.name);
    else if (isObjectType(t) && !isConnection(t) && f.args.every((a) => !isNonNullType(a.type))) {
      parts.push(depth === 0 && include.has(f.name) ? `${f.name} { ${selection(t, new Set(), 1)} }` : `${f.name} { id }`);
    }
  }
  return parts.join(" ");
}

const pagingParams = (args: readonly GraphQLArgument[]): QueryParam[] =>
  args
    .filter((a) => a.name !== "id")
    .map((a) => ({
      name: a.name,
      type: String(a.type),
      description: a.name === "first" ? `Page size, 1–100. Default ${a.defaultValue ?? 20}.` : a.name === "after" ? "Cursor from pageInfo.endCursor." : (a.description ?? ""),
    }));

function buildRoutes(): RestRoute[] {
  const routes: RestRoute[] = [];
  const query = schema.getQueryType()!;
  for (const field of Object.values(query.getFields()) as GraphQLField<unknown, unknown>[]) {
    const t = getNamedType(field.type);
    if (!isObjectType(t)) continue;

    if (isConnection(t)) {
      const node = nodeType(t);
      const rels = relationsOf(node);
      routes.push({
        method: "GET", path: `/v1/${field.name}`, resource: field.name, action: "list", kind: "list",
        description: field.description ?? `List ${field.name}.`, returns: node.name, queryField: field.name,
        pathParams: [], queryParams: [...pagingParams(field.args), ...(rels.length ? [{ name: "include", type: "String", description: `Expand: ${rels.join(", ")}` }] : [])],
        includes: rels,
      });
    } else if (field.args.some((a) => a.name === "id")) {
      const resource = plural(field.name);
      const rels = relationsOf(t);
      routes.push({
        method: "GET", path: `/v1/${resource}/:id`, resource, action: "get", kind: "get",
        description: field.description ?? `Fetch a ${field.name}.`, returns: t.name, queryField: field.name,
        pathParams: ["id"], queryParams: rels.length ? [{ name: "include", type: "String", description: `Expand: ${rels.join(", ")}` }] : [],
        includes: rels,
      });
      for (const sub of Object.values(t.getFields())) {
        const st = getNamedType(sub.type);
        if (!isObjectType(st) || !isConnection(st)) continue;
        const node = nodeType(st);
        const nrels = relationsOf(node);
        routes.push({
          method: "GET", path: `/v1/${resource}/:id/${sub.name}`, resource, action: sub.name, kind: "nested",
          description: sub.description ?? `List ${sub.name}.`, returns: node.name, queryField: field.name, nestedField: sub.name,
          pathParams: ["id"], queryParams: [...pagingParams(sub.args), ...(nrels.length ? [{ name: "include", type: "String", description: `Expand: ${nrels.join(", ")}` }] : [])],
          includes: nrels,
        });
      }
    }
  }
  return routes;
}

export const restRoutes = buildRoutes().sort((a, b) => a.resource.localeCompare(b.resource) || a.path.length - b.path.length);

export function matchRoute(segments: string[]): { route: RestRoute; params: Record<string, string> } | null {
  const path = ["v1", ...segments];
  for (const route of restRoutes) {
    const parts = route.path.slice(1).split("/");
    if (parts.length !== path.length) continue;
    const params: Record<string, string> = {};
    if (parts.every((p, i) => (p.startsWith(":") ? ((params[p.slice(1)] = decodeURIComponent(path[i])), true) : p === path[i]))) {
      return { route, params };
    }
  }
  return null;
}

const objectType = (name: string) => schema.getType(name) as GraphQLObjectType;

/** Compile a REST call into the GraphQL document the gateway will run. */
export function compile(route: RestRoute, include: Set<string>) {
  const node = selection(objectType(route.returns), include);
  const connection = `edges { node { ${node} } } pageInfo { hasNextPage endCursor }`;
  if (route.kind === "list") return `query ($first: Int, $after: String) { ${route.queryField}(first: $first, after: $after) { ${connection} } }`;
  if (route.kind === "get") return `query ($id: ID!) { ${route.queryField}(id: $id) { ${node} } }`;
  return `query ($id: ID!, $first: Int, $after: String) { ${route.queryField}(id: $id) { ${route.nestedField}(first: $first, after: $after) { ${connection} } } }`;
}

export const leafTsType = (name: string) => {
  const t = schema.getType(name);
  if (t && isEnumType(t)) return t.getValues().map((v) => JSON.stringify(v.name)).join(" | ");
  return name === "Int" || name === "Float" ? "number" : name === "Boolean" ? "boolean" : "string";
};
