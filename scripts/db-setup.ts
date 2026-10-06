import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { migrate } from "./migrate";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(pool);
    console.log("Database migrations applied. No sample data was inserted.");
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
