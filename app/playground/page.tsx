import type { Metadata } from "next";
import { printSchema } from "graphql";
import { schema } from "@/graphql/schema";
import { Playground } from "@/components/Playground";

export const metadata: Metadata = { title: "Playground" };

export default function PlaygroundPage() {
  return (
    <div className="mx-auto max-w-page px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
      <h1 className="text-[clamp(2rem,4vw,3rem)] font-medium tracking-[-0.035em]">GraphQL playground</h1>
      <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-muted">
        Queries run against the live API. Turn batching off to see the N+1 problem DataLoader removes: watch the database query count.
      </p>
      <Playground sdl={printSchema(schema)} />
    </div>
  );
}
