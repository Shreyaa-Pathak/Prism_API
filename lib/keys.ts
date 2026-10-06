import { createHash, randomBytes } from "node:crypto";
import type { Plan, StoredKey } from "./store/types";

export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

const prefixOf = (secret: string) => `${secret.slice(0, 12)}…${secret.slice(-4)}`;

/** Creates a key record and its secret. Only the hash is stored; the secret is shown once. */
export function newKey(accountId: string, name: string, plan: Plan = "standard") {
  const secret = `atl_live_${randomBytes(18).toString("base64url")}`;
  const record: StoredKey = {
    id: `key_${randomBytes(6).toString("hex")}`,
    accountId,
    name,
    prefix: prefixOf(secret),
    hash: hashKey(secret),
    plan,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  return { record, secret };
}

export function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return req.headers.get("x-api-key")?.trim() || null;
}
