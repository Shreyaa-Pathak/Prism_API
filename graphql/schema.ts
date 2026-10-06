import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./typeDefs";
import { resolvers } from "./resolvers";

/** The one schema. GraphQL, REST, the SDK and the reference docs are all derived from it. */
export const schema = makeExecutableSchema({ typeDefs, resolvers });
