export const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-api-key, x-prism-batching",
  "access-control-expose-headers":
    "x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, retry-after, x-request-id, x-response-time, x-prism-db-queries",
};

export const apiError = (code: string, message: string) => ({ error: { code, message, docs: `/docs#errors` } });

export function json(status: number, body: unknown, headers?: HeadersInit) {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body, null, 2), { status, headers: h });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });
