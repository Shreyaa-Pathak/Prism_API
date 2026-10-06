import { createPostgresStore } from "./postgres";
import type { PlatformStore } from "./types";

const g = globalThis as unknown as { __prismStore?: PlatformStore };

/** Normal requests never fall back to sample data. */
export function getStore(): PlatformStore {
  if (!g.__prismStore) {
    if (!process.env.DATABASE_URL)
      throw new Error(
        "DATABASE_URL is required. Run database migrations before starting Prism.",
      );
    if (process.env.NODE_ENV === "production") {
      if (
        !process.env.SESSION_SECRET ||
        process.env.SESSION_SECRET.length < 32 ||
        /[<>]/.test(process.env.SESSION_SECRET)
      )
        throw new Error("A strong SESSION_SECRET is required.");
      if (
        !process.env.PRISM_PUBLIC_URL ||
        new URL(process.env.PRISM_PUBLIC_URL).protocol !== "https:"
      )
        throw new Error(
          "PRISM_PUBLIC_URL must be an HTTPS origin in production.",
        );
    }
    g.__prismStore = createPostgresStore(process.env.DATABASE_URL);
  }
  return g.__prismStore;
}

export type * from "./types";
