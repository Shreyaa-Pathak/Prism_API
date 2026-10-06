import { headers } from "next/headers";

export async function getOrigin() {
  if (process.env.PRISM_PUBLIC_URL) return process.env.PRISM_PUBLIC_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
