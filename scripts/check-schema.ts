/**
 * CI gate: compares the current schema with the committed snapshot (schema.graphql) and
 * validates every operation clients sent in the last 30 days against the new schema.
 *
 *   OBSERVED_OPERATIONS_URL=https://api.example.com/api/internal/observed-operations \
 *   ADMIN_TOKEN=… npm run schema:check
 *
 * or with an exported file:  npm run schema:check -- --ops observed.json
 */
import { readFileSync } from "node:fs";
import { schema } from "../graphql/schema";
import { checkSchema, parseObserved, WINDOW_DAYS } from "../graphql/schemaCheck";
import { readSchemaBaseline } from "../graphql/schemaBaseline";
import type { ObservedOperation } from "../lib/store/types";

async function loadObserved(): Promise<ObservedOperation[] | null> {
  const i = process.argv.indexOf("--ops");
  if (i > -1) {
    if (!process.argv[i + 1]) throw new Error("--ops requires a JSON file path.");
    return parseObserved(JSON.parse(readFileSync(process.argv[i + 1], "utf8")));
  }
  const url = process.env.OBSERVED_OPERATIONS_URL;
  if (!url) return null;
  const res = await fetch(url, { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN ?? ""}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Could not load observed operations: ${res.status}`);
  return parseObserved(await res.json());
}

async function main() {
  const i = process.argv.indexOf("--baseline-ref");
  const ref = i > -1 ? process.argv[i + 1] : process.env.SCHEMA_BASE_REF;
  if (i > -1 && !ref) throw new Error("--baseline-ref requires a git revision.");
  if (process.env.CI && !ref) throw new Error("CI requires SCHEMA_BASE_REF or --baseline-ref pointing to a trusted base revision.");
  const baseline = readSchemaBaseline(ref);
  console.log(`Schema baseline: ${ref ?? "local schema.graphql (use --baseline-ref for a trusted revision)"}`);
  const observed = await loadObserved();
  const result = checkSchema(schema, baseline, observed);

  console.log(`Breaking changes vs snapshot: ${result.breaking.length}`);
  for (const c of result.breaking) console.log(`  - ${c.type}: ${c.description}`);
  if (observed === null) {
    console.log("No observed operations source configured, so every breaking change blocks.");
  } else {
    console.log(`Operations seen in the last ${WINDOW_DAYS} days: ${observed.filter((op) => op.lastSeen >= Date.now() - WINDOW_DAYS * 86400000).length}`);
    for (const a of result.affected) {
      console.log(`\n  ✗ operation ${a.hash} (seen ${a.count}×, last ${new Date(a.lastSeen).toISOString()})`);
      for (const e of a.errors) console.log(`      ${e}`);
    }
  }
  console.log(result.pass ? "\nPASS: no client query in the window would break." : "\nBLOCK: this change breaks queries clients are sending.");
  process.exit(result.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
