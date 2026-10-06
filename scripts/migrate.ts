import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";

export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(428719)");
    // Preserve applied migration history when adopting a renamed project.
    if (!(await client.query("select to_regclass('prism_migrations') as ledger")).rows[0].ledger) {
      const previous = await client.query<{ table_name: string }>(
        `select table_name from information_schema.columns
         where table_schema = current_schema()
           and right(table_name, 11) = '_migrations'
         group by table_name
         having count(*) = 3
           and count(*) filter (where column_name in ('name', 'checksum', 'applied_at')) = 3`,
      );
      if (previous.rows.length > 1)
        throw new Error("Multiple migration history tables found; select the correct one and rename it to prism_migrations.");
      if (previous.rows.length === 1) {
        const identifier = previous.rows[0].table_name.replace(/"/g, '""');
        await client.query(`alter table "${identifier}" rename to prism_migrations`);
      }
    }
    await client.query(
      "create table if not exists prism_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
    const dir = resolve("db/migrations");
    for (const name of readdirSync(dir)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(resolve(dir, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query(
        "select checksum from prism_migrations where name=$1",
        [name],
      );
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(
            `Applied migration ${name} has changed; create a new migration.`,
          );
        continue;
      }
      await client.query(sql);
      await client.query(
        "insert into prism_migrations(name,checksum) values($1,$2)",
        [name, checksum],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
