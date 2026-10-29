import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { provisionSandbox } from "./provision-sandbox";

loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL || !process.env.PRISM_SANDBOX_KEY) throw new Error("Set DATABASE_URL and PRISM_SANDBOX_KEY, then run db:migrate first.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await provisionSandbox(pool, process.env.PRISM_SANDBOX_KEY);
    console.log("Public sample workspace ready. Open /demo. The configured sandbox key is intentionally public; never use a private workspace key.");
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
