import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** CI reads a historical snapshot, so a PR cannot hide removals by editing its own snapshot. */
export function readSchemaBaseline(ref?: string, cwd = process.cwd()) {
  if (!ref) return readFileSync(`${cwd}/schema.graphql`, "utf8");
  if (!/^[a-zA-Z0-9_./~-]+$/.test(ref) || ref.startsWith("-")) throw new Error("Invalid schema baseline revision.");
  return execFileSync("git", ["show", `${ref}:schema.graphql`], { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
}
