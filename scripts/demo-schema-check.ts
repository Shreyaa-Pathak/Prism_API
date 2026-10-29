import { buildSchema } from "graphql";
import { checkSchema } from "../graphql/schemaCheck";

// Synthetic, reproducible contract demonstration. No production history or latency claims.
const now = Date.now();
const baseline = "type Query { project: Project } type Project { id: ID!, name: String! }";
const next = buildSchema("type Query { project: Project } type Project { id: ID! }");
const operation = { hash: "walkthrough", document: "{ project { id name } }", firstSeen: now, lastSeen: now, count: 1 };
const recent = checkSchema(next, baseline, [operation], now);
const expired = checkSchema(next, baseline, [{ ...operation, firstSeen: now - 31 * 86400000, lastSeen: now - 31 * 86400000 }], now);
console.log("Removing Project.name with a query seen today:", recent.pass ? "UNEXPECTED PASS" : "BLOCKED");
for (const affected of recent.affected) for (const error of affected.errors) console.log(`  ${error}`);
console.log("Same query last seen 31 days ago:", expired.pass ? "ALLOWED" : "UNEXPECTED BLOCK");
console.log("No traffic source:", checkSchema(next, baseline, null, now).pass ? "UNEXPECTED PASS" : "BLOCKED (conservative fallback)");
if (recent.pass || !expired.pass || checkSchema(next, baseline, null, now).pass) process.exitCode = 1;
