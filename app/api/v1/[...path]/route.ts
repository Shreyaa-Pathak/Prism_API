import { withEdge } from "@/lib/edge";
import { apiError, CORS, json, preflight } from "@/lib/http";
import { matchRoute, restRoutes } from "@/graphql/rest";
import { executeRest } from "@/graphql/restHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  const { path } = await params;
  const match = matchRoute(path);
  if (!match) {
    return json(
      404,
      {
        ...apiError("unknown_route", `No route GET /v1/${path.join("/")}.`),
        routes: restRoutes.map((r) => `${r.method} ${r.path}`),
      },
      CORS,
    );
  }
  const batch = req.headers.get("x-prism-batching")?.toLowerCase() !== "off";
  return withEdge(req, `GET ${match.route.path}`, ({ key }) =>
    executeRest(
      match.route,
      match.params,
      new URL(req.url).searchParams,
      batch,
      key.accountId,
    ),
  );
}

const notAllowed = () =>
  json(
    405,
    apiError("method_not_allowed", "The REST API is read-only. Use GET."),
    { ...CORS, allow: "GET, OPTIONS" },
  );
export const POST = notAllowed;
export const PUT = notAllowed;
export const PATCH = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = preflight;
