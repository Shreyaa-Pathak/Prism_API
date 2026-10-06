import { getIdentity } from "./session";
import { apiError, json } from "./http";
import type { Identity } from "./store/types";

export function sameOrigin(req: Request) {
  const allowed = process.env.PRISM_PUBLIC_URL;
  if (!allowed)
    return (
      process.env.NODE_ENV !== "production" &&
      req.headers.get("origin") === new URL(req.url).origin
    );
  return req.headers.get("origin") === new URL(allowed).origin;
}
export async function dashboardRequest(
  req: Request,
  handler: (identity: Identity) => Promise<Response>,
) {
  try {
    if (req.method !== "GET" && !sameOrigin(req))
      return json(403, apiError("forbidden", "Same-origin request required."));
    const identity = await getIdentity();
    if (!identity)
      return json(401, apiError("unauthorized", "Sign in to continue."));
    return await handler(identity);
  } catch (e) {
    console.error("[prism] dashboard request failed", e);
    const code = (e as { code?: string }).code;
    if (code === "23505")
      return json(409, apiError("conflict", "That value is already in use."));
    if (code === "KEY_LIMIT")
      return json(
        409,
        apiError(
          "key_limit",
          "You can have 5 active keys. Revoke one to create another.",
        ),
      );
    return json(500, apiError("internal", "Could not complete the request."));
  }
}
