import { readJson } from "@/lib/input";
import { withEdge } from "@/lib/edge";
import { apiError, preflight } from "@/lib/http";
import { runOperation } from "@/graphql/execute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const batching = (req: Request) =>
  req.headers.get("x-prism-batching")?.toLowerCase() !== "off";

export async function POST(req: Request) {
  return withEdge(req, "POST /graphql", async ({ key }) => {
    let payload: {
      query?: unknown;
      variables?: unknown;
      operationName?: unknown;
    };
    try {
      payload = (await readJson(req)) as typeof payload;
    } catch {
      return {
        status: 400,
        body: apiError(
          "invalid_body",
          'Send a JSON body: { "query": "…", "variables": {…} }.',
        ),
      };
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.query !== "string" ||
      !payload.query.trim()
    ) {
      return {
        status: 400,
        body: apiError("invalid_body", "`query` must be a non-empty string."),
      };
    }
    const r = await runOperation({
      workspaceId: key.accountId,
      source: payload.query,
      variables: (payload.variables as Record<string, unknown>) ?? null,
      operationName:
        typeof payload.operationName === "string"
          ? payload.operationName
          : null,
      batch: batching(req),
    });
    return {
      status: r.status,
      body: r.body,
      headers: { "x-prism-db-queries": String(r.dbQueries) },
    };
  });
}

export async function GET(req: Request) {
  return withEdge(req, "GET /graphql", async ({ key }) => {
    const url = new URL(req.url);
    const query = url.searchParams.get("query");
    if (!query)
      return {
        status: 400,
        body: apiError("invalid_parameter", "Pass ?query=… or use POST."),
      };
    let variables: Record<string, unknown> | null = null;
    try {
      variables = url.searchParams.get("variables")
        ? JSON.parse(url.searchParams.get("variables")!)
        : null;
    } catch {
      return {
        status: 400,
        body: apiError("invalid_parameter", "`variables` must be JSON."),
      };
    }
    if (/^\s*mutation\b/.test(query))
      return {
        status: 405,
        body: apiError("method_not_allowed", "Use POST for mutations."),
      };
    const r = await runOperation({
      workspaceId: key.accountId,
      source: query,
      variables,
      batch: batching(req),
    });
    return {
      status: r.status,
      body: r.body,
      headers: { "x-prism-db-queries": String(r.dbQueries) },
    };
  });
}

export const OPTIONS = preflight;
