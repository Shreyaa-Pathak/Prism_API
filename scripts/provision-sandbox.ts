import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { hashKey } from "../lib/keys";
import { hashPassword } from "../lib/password";

/** Idempotent and transactional; never adopts an existing ordinary user/workspace. */
export async function provisionSandbox(pool: Pool, key: string, { restore = false } = {}) {
  if (key.length < 24 || /[<>]/.test(key)) throw new Error("PRISM_SANDBOX_KEY must contain at least 24 characters without placeholders. It will be public.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(428720)");
    const existing = await client.query("select is_sandbox from workspaces where id='wsp_prism_sandbox'");
    if (existing.rows.length && !existing.rows[0].is_sandbox) throw new Error("Refusing to adopt a non-sandbox workspace.");
    if (!existing.rows.length) {
      await client.query("insert into users(id,name,email,password_hash) values($1,$2,$3,$4)", ["usr_prism_sandbox", "Prism Demo", "sandbox@prism.example.test", await hashPassword(randomBytes(48).toString("hex"))]);
      await client.query("insert into workspaces(id,name,is_sandbox) values('wsp_prism_sandbox','Public sample workspace',true)");
      await client.query("insert into workspace_members(workspace_id,user_id) values('wsp_prism_sandbox','usr_prism_sandbox')");
    }
    for (const [i, name] of ["Website", "Dashboard", "API gateway"].entries()) {
      const projectId = `prj_sandbox_${i + 1}`;
      await client.query(`insert into projects(id,workspace_id,name,slug,owner_id,created_at)
        values($1,'wsp_prism_sandbox',$2,$3,'usr_prism_sandbox',now()-($4::int*interval '1 day'))
        on conflict (workspace_id,slug) do nothing`, [projectId, name, `demo-${i + 1}`, i]);
      for (let j = 0; j < 3; j++) {
        await client.query(`insert into deployments(id,workspace_id,project_id,status,branch,commit_sha,created_at)
          values($1,'wsp_prism_sandbox',$2,$3,$4,$5,now()-($6::int*interval '1 hour')) on conflict(id) do nothing`,
        [`dep_sandbox_${i + 1}_${j + 1}`, projectId, j === 2 ? "FAILED" : "READY", j === 2 ? "feature/search" : "main", `demo${i}${j}abc`, j]);
      }
    }
    // Re-running rotates the public credential, leaving unrelated keys untouched.
    // An operator's revocation is kept unless `restore` is explicitly requested.
    const { rows } = await client.query(`insert into api_keys(id,workspace_id,name,prefix,hash,plan)
      values('key_prism_sandbox','wsp_prism_sandbox','Public sandbox',$1,$2,'sandbox')
      on conflict(id) do update set hash=excluded.hash,prefix=excluded.prefix,
        revoked_at=case when $3::boolean then null else api_keys.revoked_at end
      where api_keys.workspace_id='wsp_prism_sandbox' returning revoked_at`, [key.slice(0, 12), hashKey(key), restore]);
    await client.query("commit");
    return { revoked: rows[0]?.revoked_at != null };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}
