import type { EdgeResult } from "@/lib/edge";
import { apiError } from "@/lib/http";
import { runOperation } from "./execute";
import { compile, type RestRoute } from "./rest";

type Gql = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

export async function executeRest(
  route: RestRoute,
  params: Record<string, string>,
  search: URLSearchParams,
  batch: boolean,
  workspaceId: string,
): Promise<EdgeResult> {
  const variables: Record<string, unknown> = { ...params };
  for (const qp of route.queryParams) {
    const v = search.get(qp.name);
    if (v === null || qp.name === "include") continue;
    if (qp.type.startsWith("Int")) {
      if (!/^-?\d+$/.test(v))
        return {
          status: 400,
          body: apiError(
            "invalid_parameter",
            `\`${qp.name}\` must be an integer.`,
          ),
        };
      variables[qp.name] = Number(v);
    } else variables[qp.name] = v;
  }
  const include = new Set(
    (search.get("include") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const i of include) {
    if (!route.includes.includes(i)) {
      return {
        status: 400,
        body: apiError(
          "invalid_parameter",
          `Cannot include \`${i}\` here. Allowed: ${route.includes.join(", ") || "none"}.`,
        ),
      };
    }
  }

  const { status, body, dbQueries } = await runOperation({
    workspaceId,
    source: compile(route, include),
    variables,
    batch,
  });
  const headers = { "x-prism-db-queries": String(dbQueries) };
  const gql = body as Gql;
  if (gql.errors?.length) {
    const bad = gql.errors.find((e) => e.extensions?.code === "BAD_USER_INPUT");
    return bad
      ? {
          status: 400,
          body: apiError("invalid_parameter", bad.message),
          headers,
        }
      : {
          status: status === 200 ? 500 : status,
          body: apiError("internal", "Could not complete the request."),
          headers,
        };
  }

  const root = gql.data?.[route.queryField] as Record<string, unknown> | null;
  if (root === null || root === undefined) {
    return {
      status: 404,
      body: apiError(
        "not_found",
        `No ${route.returns.toLowerCase()} with id \`${params.id}\`.`,
      ),
      headers,
    };
  }
  if (route.kind === "get")
    return { status: 200, body: { data: root }, headers };
  const conn = (route.kind === "nested" ? root[route.nestedField!] : root) as {
    edges: { node: unknown }[];
    pageInfo: unknown;
  };
  return {
    status: 200,
    body: { data: conn.edges.map((e) => e.node), pageInfo: conn.pageInfo },
    headers,
  };
}
