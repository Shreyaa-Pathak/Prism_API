import { generateSdk } from "@/graphql/sdkgen";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = process.env.PRISM_PUBLIC_URL ?? new URL(req.url).origin;
  return new Response(generateSdk().replace("__BASE_URL__", origin), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'inline; filename="prism.ts"',
      "access-control-allow-origin": "*",
    },
  });
}
