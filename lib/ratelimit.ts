import type { Plan } from "./store/types";
export const PLANS: Record<
  Plan,
  { capacity: number; refillPerSec: number; label: string }
> = {
  sandbox: { capacity: 10, refillPerSec: 1, label: "Sandbox" },
  standard: { capacity: 100, refillPerSec: 10, label: "Standard" },
};
export interface LimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter: number;
}
export function bucketResult(
  tokens: number,
  capacity: number,
  refill: number,
  allowed: boolean,
): LimitResult {
  return {
    allowed,
    limit: capacity,
    remaining: Math.floor(tokens),
    reset: Math.ceil((capacity - tokens) / refill),
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((1 - tokens) / refill)),
  };
}
