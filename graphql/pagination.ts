import { GraphQLError } from "graphql";

export const MAX_PAGE = 100;

export const encode = (id: string) => Buffer.from(`c:${id}`).toString("base64url");

export function decode(cursor: string): string {
  const raw = Buffer.from(cursor, "base64url").toString();
  if (!raw.startsWith("c:") || raw.length < 3) {
    throw new GraphQLError("The `after` cursor is not valid. Use pageInfo.endCursor from a previous page.", { extensions: { code: "BAD_USER_INPUT" } });
  }
  return raw.slice(2);
}

export function assertFirst(first: number) {
  if (!Number.isInteger(first) || first < 1 || first > MAX_PAGE) {
    throw new GraphQLError(`\`first\` must be between 1 and ${MAX_PAGE}.`, { extensions: { code: "BAD_USER_INPUT" } });
  }
}

/** Rows are fetched with take: first + 1, so one extra row means there is another page. */
export function toConnection<T extends { id: string }>(rows: T[], first: number) {
  const nodes = rows.slice(0, first);
  return {
    edges: nodes.map((node) => ({ cursor: encode(node.id), node })),
    pageInfo: { hasNextPage: rows.length > first, endCursor: nodes.length ? encode(nodes[nodes.length - 1].id) : null },
  };
}
