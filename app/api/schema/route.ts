import { printSchema } from "graphql";
import { schema } from "@/graphql/schema";

export const dynamic = "force-static";

export function GET() {
  return new Response(printSchema(schema), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}
