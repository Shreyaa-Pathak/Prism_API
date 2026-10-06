/**
 * CI gate: compares the current schema with the committed snapshot (schema.graphql) and
 * validates every operation clients sent in the last 30 days against the new schema.
 *
 *   OBSERVED_OPERATIONS_URL=https://api.example.com/api/internal/observed-operations \
 *   ADMIN_TOKEN=… npm run schema:check
 *
 * or with an exported file:  npm run schema:check -- --ops observed.json
 */
import { readFileSync, existsSync } from "node:fs";
import { schema } from "../graphql/schema";
import { checkSchema, WINDOW_DAYS } from "../graphql/schemaCheck";
import type { ObservedOperation } from "../lib/store/types";

async function loadObserved(): Promise<ObservedOperation[] | null> {
  const i = process.argv.indexOf("--ops");
  if (i > -1) return JSON.parse(readFileSync(process.argv[i + 1], "utf8")).operations;
  const url = process.env.OBSERVED_OPERATIONS_URL;
  if (!url) return null;
  const res = await fetch(url, { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN ?? ""}` } });
  if (!res.ok) throw new Error(`Could not load observed operations: ${res.status}`);
  return (await res.json()).operations;
}

async function main() {
  if (!existsSync("schema.graphql")) {
    console.error("schema.graphql snapshot is missing. Run `npm run schema:snapshot` and commit it.");
    process.exit(1);
  }
  const observed = await loadObserved();
  const result = checkSchema(schema, readFileSync("schema.graphql", "utf8"), observed);

  console.log(`Breaking changes vs snapshot: ${result.breaking.length}`);
  for (const c of result.breaking) console.log(`  - ${c.type}: ${c.description}`);
  if (observed === null) {
    console.log("No observed operations source configured, so every breaking change blocks.");
  } else {
    console.log(`Operations seen in the last ${WINDOW_DAYS} days: ${observed.length}`);
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
