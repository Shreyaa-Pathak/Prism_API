import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSchema } from "graphql";
import { checkSchema, parseObserved, WINDOW_DAYS } from "../graphql/schemaCheck";
import { readSchemaBaseline } from "../graphql/schemaBaseline";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const now = Date.UTC(2026, 9, 29);
const before = "type Query { project: Project } type Project { id: ID!, name: String!, unused: String }";
const after = buildSchema("type Query { project: Project } type Project { id: ID! }");
const op = (document: string, lastSeen = now) => ({ hash: "test", document, firstSeen: lastSeen, lastSeen, count: 1 });

test("blocks removals used by recent queries, aliases and fragments", () => {
  for (const document of ["{ project { name } }", "query { p:project { ...Fields } } fragment Fields on Project { name }"]) {
    const result = checkSchema(after, before, [op(document)], now);
    assert.equal(result.pass, false);
    assert.equal(result.affected.length, 1);
  }
});
test("30-day boundary includes exactly 30 days and excludes older queries", () => {
  const cutoff = now - WINDOW_DAYS * 86400000;
  assert.equal(checkSchema(after, before, [op("{project{name}}", cutoff)], now).pass, false);
  assert.equal(checkSchema(after, before, [op("{project{name}}", cutoff - 1)], now).pass, true);
});
test("unused removals are allowed with valid traffic history; absent history blocks", () => {
  assert.equal(checkSchema(after, before, [op("{project{id}}")], now).pass, true);
  assert.equal(checkSchema(after, before, [], now).pass, true);
  assert.equal(checkSchema(after, before, null, now).pass, false);
  assert.equal(checkSchema(buildSchema(before), before, null, now).pass, true);
});
test("required argument changes break observed variable-based queries", () => {
  const previous = "type Query { project(id: ID): String }";
  const next = buildSchema("type Query { project(id: ID!): String }");
  assert.equal(checkSchema(next, previous, [op("query($id:ID){project(id:$id)}")], now).pass, false);
});
test("malformed and incomplete operation feeds fail closed", () => {
  for (const value of [{}, { operations: null }, { operations: [null] }, { operations: [{ ...op("{project{id}}"), lastSeen: "today" }] }, { operations: [op("not graphql")] }])
    assert.throws(() => parseObserved(value));
  assert.deepEqual(parseObserved({ operations: [op("{project{id}}")] }), [op("{project{id}}")]);
});
test("trusted git baseline ignores an edited working snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "prism-schema-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init");
    await writeFile(join(root, "schema.graphql"), before);
    git("add", "schema.graphql");
    git("-c", "user.name=Prism test", "-c", "user.email=test@example.test", "commit", "-m", "Baseline");
    await writeFile(join(root, "schema.graphql"), "type Query { id: ID }");
    assert.equal(readSchemaBaseline("HEAD", root), before);
    assert.equal(checkSchema(after, readSchemaBaseline("HEAD", root), null, now).pass, false);
    assert.throws(() => readSchemaBaseline("--bad", root));
    assert.throws(() => readSchemaBaseline("missing-revision", root));
  } finally {
    // Delete only the generated directory within the OS temporary root.
    if (resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes("prism-schema-")) await rm(root, { recursive: true, force: true });
  }
});
