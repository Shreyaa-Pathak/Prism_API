import { loadEnvConfig } from "@next/env";
import { createPostgresStore } from "../lib/store/postgres";
import { hashPassword, verifyPassword } from "../lib/password";
loadEnvConfig(process.cwd());
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production.");
  const url = process.env.DATABASE_URL,
    password = process.env.DEV_SEED_PASSWORD;
  if (!url || !password || password.length < 12)
    throw new Error(
      "Set DATABASE_URL and DEV_SEED_PASSWORD (at least 12 characters).",
    );
  const store = createPostgresStore(url);
  try {
    // Two explicit personas; no shared sandbox key is created.
    for (const [name, email] of [
      ["Development A", "dev-a@example.test"],
      ["Development B", "dev-b@example.test"],
    ]) {
      const existing = await store.identity.credentials(email);
      if (existing) {
        if (!(await verifyPassword(password, existing.passwordHash)))
          throw new Error("Existing seed account has a different password.");
        continue;
      }
      const identity = await store.identity.register(
        name,
        email,
        await hashPassword(password),
      );
      const data = store.data(identity.workspaceId);
      for (let i = 1; i <= 3; i++) {
        const project = await data.project.create({
          name: `${name} project ${i}`,
          slug: `project-${i}`,
          ownerId: identity.userId,
        });
        await data.deployment.create({
          projectId: project.id,
          status: "READY",
          branch: "main",
          commit: `dev-seed-${i}`,
        });
      }
    }
    console.log(
      "Development workspaces created for dev-a@example.test and dev-b@example.test. Sign in and create your own API keys.",
    );
  } finally {
    await store.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
