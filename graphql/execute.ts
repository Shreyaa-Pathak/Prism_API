import { createHash } from "node:crypto";
import {
  execute,
  GraphQLError,
  Kind,
  parse,
  print,
  validate,
  visit,
  type DocumentNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import { schema } from "./schema";
import { createContext } from "./context";
import { getStore } from "@/lib/store";

export const MAX_DEPTH = 8;

function depthOf(doc: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const d of doc.definitions)
    if (d.kind === Kind.FRAGMENT_DEFINITION) fragments.set(d.name.value, d);
  const walk = (
    set: SelectionSetNode | undefined,
    depth: number,
    seen: Set<string>,
  ): number => {
    if (!set) return depth;
    let max = depth;
    for (const s of set.selections) {
      if (s.kind === Kind.FIELD)
        max = Math.max(max, walk(s.selectionSet, depth + 1, seen));
      else if (s.kind === Kind.INLINE_FRAGMENT)
        max = Math.max(max, walk(s.selectionSet, depth, seen));
      else if (!seen.has(s.name.value)) {
        const f = fragments.get(s.name.value);
        if (f)
          max = Math.max(
            max,
            walk(f.selectionSet, depth, new Set([...seen, s.name.value])),
          );
      }
    }
    return max;
  };
  let max = 0;
  for (const d of doc.definitions)
    if (d.kind === Kind.OPERATION_DEFINITION)
      max = Math.max(max, walk(d.selectionSet, 0, new Set()));
  return max;
}

const formatError = (e: GraphQLError) => {
  const internal =
    e.originalError && !(e.originalError instanceof GraphQLError);
  if (internal) console.error("[prism] resolver error", e.originalError);
  return {
    message: internal ? "Internal server error." : e.message,
    ...(e.locations ? { locations: e.locations } : {}),
    ...(e.path ? { path: e.path } : {}),
    extensions: {
      code: internal
        ? "INTERNAL"
        : ((e.extensions?.code as string) ?? "GRAPHQL_ERROR"),
    },
  };
};

export interface RunInput {
  workspaceId: string;
  source: string;
  variables?: Record<string, unknown> | null;
  operationName?: string | null;
  batch?: boolean;
}
export interface RunOutput {
  status: number;
  body: { data?: unknown; errors?: unknown[]; extensions?: unknown };
  dbQueries: number;
}

/** Parse, validate, execute against the shared schema, and remember the operation for schema checks. */
export async function runOperation({
  workspaceId,
  source,
  variables,
  operationName,
  batch = true,
}: RunInput): Promise<RunOutput> {
  if (!workspaceId) throw new Error("Authenticated workspace required.");
  if (typeof source !== "string" || Buffer.byteLength(source) > 65536)
    return {
      status: 400,
      body: { errors: [{ message: "Query exceeds 64 KiB." }] },
      dbQueries: 0,
    };
  if (
    variables != null &&
    (typeof variables !== "object" || Array.isArray(variables))
  )
    return {
      status: 400,
      body: { errors: [{ message: "Variables must be an object." }] },
      dbQueries: 0,
    };
  let document: DocumentNode;
  try {
    document = parse(source);
  } catch (e) {
    return {
      status: 400,
      body: { errors: [formatError(e as GraphQLError)] },
      dbQueries: 0,
    };
  }
  const errors = validate(schema, document);
  if (errors.length)
    return {
      status: 400,
      body: { errors: errors.map(formatError) },
      dbQueries: 0,
    };
  let fields = 0;
  visit(document, {
    Field() {
      fields++;
    },
  });
  if (fields > 200)
    return {
      status: 400,
      body: { errors: [{ message: "Too many query fields." }] },
      dbQueries: 0,
    };
  const depth = depthOf(document);
  if (depth > MAX_DEPTH) {
    return {
      status: 400,
      body: {
        errors: [
          {
            message: `Query depth ${depth} exceeds the limit of ${MAX_DEPTH}.`,
            extensions: { code: "QUERY_TOO_DEEP" },
          },
        ],
      },
      dbQueries: 0,
    };
  }

  const store = getStore();
  // Preserve operation shape for compatibility checks without persisting literal private IDs/text.
  const printed = print(
    visit(document, {
      StringValue: (n) => ({ ...n, value: "" }),
      IntValue: (n) => ({ ...n, value: "0" }),
      FloatValue: (n) => ({ ...n, value: "0.0" }),
    }),
  );
  await store.operations.record(
    createHash("sha256").update(printed).digest("hex").slice(0, 32),
    printed,
    Date.now(),
  );

  const ctx = createContext(store.data(workspaceId), { batch });
  const result = await execute({
    schema,
    document,
    variableValues: variables ?? undefined,
    operationName: operationName ?? undefined,
    contextValue: ctx,
  });
  const body: RunOutput["body"] = { data: result.data ?? null };
  if (result.errors?.length) body.errors = result.errors.map(formatError);
  body.extensions = { dbQueries: ctx.stats.dbQueries, batching: batch };
  return { status: 200, body, dbQueries: ctx.stats.dbQueries };
}
