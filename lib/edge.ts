import { randomBytes } from "node:crypto";
import { getStore } from "./store";
import type { ApiKey } from "./store/types";
import { extractKey, hashKey } from "./keys";
import { PLANS } from "./ratelimit";
import { apiError, CORS, json } from "./http";

export interface EdgeResult { status: number; body: unknown; headers?: Record<string, string> }

/**
 * The edge pipeline every public request goes through before it reaches the gateway:
 * authenticate the key, take a token from its bucket, run the handler, meter the result.
 */
async function edgeRequest(req: Request, route: string, handler: (ctx: { key: ApiKey }) => Promise<EdgeResult>): Promise<Response> {
  const t0 = performance.now();
  const store = getStore();
  const headers = new Headers(CORS);
  headers.set("x-request-id", `req_${randomBytes(6).toString("hex")}`);
  headers.set("cache-control", "no-store");

  const raw = extractKey(req);
  if (!raw) {
    headers.set("www-authenticate", 'Bearer realm="prism"');
    return json(401, apiError("missing_key", "Send your API key as 'Authorization: Bearer <key>'."), headers);
  }
  const key = await store.keys.findByHash(hashKey(raw));
  if (!key || key.revokedAt) {
    return json(401, apiError(key ? "revoked_key" : "invalid_key", key ? "This API key was revoked." : "This API key is not recognised."), headers);
  }

  const cfg = PLANS[key.plan];
  const limit = await store.limits.take(key.id, cfg.capacity, cfg.refillPerSec);
  headers.set("x-ratelimit-limit", String(limit.limit));
  headers.set("x-ratelimit-remaining", String(limit.remaining));
  headers.set("x-ratelimit-reset", String(limit.reset));

  let status: number;
  let body: unknown;
  if (!limit.allowed) {
    headers.set("retry-after", String(limit.retryAfter));
    status = 429;
    body = apiError("rate_limited", `Rate limit exceeded for this key. Retry in ${limit.retryAfter}s.`);
  } else {
    try {
      const r = await handler({ key });
      status = r.status;
      body = r.body;
      for (const [k, v] of Object.entries(r.headers ?? {})) headers.set(k, v);
    } catch (err) {
      console.error("[prism] unhandled error", err);
      status = 500;
      body = apiError("internal", "Something went wrong on our side. The request id helps us find it.");
    }
  }

  const latencyMs = performance.now() - t0;
  headers.set("x-response-time", `${latencyMs.toFixed(1)}ms`);
  const now = Date.now();
  await Promise.all([
    store.usage.record({ keyId: key.id, workspaceId: key.accountId, at: now, route, status, latencyMs }),
    store.keys.touch(key.id, new Date(now).toISOString()),
  ]).catch((e) => console.error("[prism] metering failed", e));

  return json(status, body, headers);
}

/** Database/config failures return a sanitized response, including authentication failures. */
export async function withEdge(req: Request, route: string, handler: (ctx: { key: ApiKey }) => Promise<EdgeResult>): Promise<Response> {
  try { return await edgeRequest(req,route,handler); }
  catch (e) { console.error("[prism] gateway unavailable", e); return json(503, apiError("unavailable", "Service temporarily unavailable."), { ...CORS, "cache-control":"no-store" }); }
}
