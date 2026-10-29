import { buildSchema, findBreakingChanges, parse, validate, type GraphQLSchema } from "graphql";
import type { ObservedOperation } from "@/lib/store/types";

export const WINDOW_DAYS = 30;

/** Reject incomplete/untrusted history rather than silently treating it as no traffic. */
export function parseObserved(value: unknown): ObservedOperation[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { operations?: unknown }).operations))
    throw new Error("Operation history must contain an operations array.");
  const operations = (value as { operations: unknown[] }).operations;
  for (const operation of operations) {
    const op = operation as Partial<ObservedOperation> | null;
    if (!op || typeof op.hash !== "string" || !op.hash || typeof op.document !== "string" ||
        typeof op.firstSeen !== "number" || !Number.isFinite(op.firstSeen) ||
        typeof op.lastSeen !== "number" || !Number.isFinite(op.lastSeen) ||
        op.firstSeen > op.lastSeen || typeof op.count !== "number" || !Number.isInteger(op.count) || op.count < 1)
      throw new Error("Invalid observed operation record.");
    parse(op.document);
  }
  return operations as ObservedOperation[];
}

export interface CheckResult {
  breaking: { type: string; description: string }[];
  affected: { hash: string; lastSeen: number; count: number; errors: string[]; document: string }[];
  pass: boolean;
}

/**
 * A change is blocked only if it breaks an operation clients actually sent in the last 30 days.
 * Breaking changes nobody uses are reported but allowed.
 */
export function checkSchema(next: GraphQLSchema, previousSdl: string, observed: ObservedOperation[] | null, now = Date.now()): CheckResult {
  const breaking = findBreakingChanges(buildSchema(previousSdl), next).map((c) => ({ type: c.type, description: c.description }));
  if (observed === null) {
    // No traffic data available: be safe and treat every breaking change as blocking.
    return { breaking, affected: [], pass: breaking.length === 0 };
  }
  const cutoff = now - WINDOW_DAYS * 86_400_000;
  const affected: CheckResult["affected"] = [];
  for (const op of observed) {
    if (op.lastSeen < cutoff) continue;
    const errors = validate(next, parse(op.document)).map((e) => e.message);
    if (errors.length) affected.push({ hash: op.hash, lastSeen: op.lastSeen, count: op.count, errors, document: op.document });
  }
  return { breaking, affected, pass: affected.length === 0 };
}
