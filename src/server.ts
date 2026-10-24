import { createSchema, createYoga } from "graphql-yoga";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvers } from "./graphql/resolvers/index.ts";
import { prisma } from "./lib/prisma.ts";
import { extractAuthUser, type GraphQLContext } from "./utils/auth.ts";

const typeDefs = readFileSync(join(import.meta.dir, "graphql/schema.graphql"), "utf-8");

const yoga = createYoga<GraphQLContext>({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  graphqlEndpoint: "/graphql",
  context: async ({ request }) => {
    const authHeader = request.headers.get("authorization");
    const user = extractAuthUser(authHeader);
    return {
      user,
      prisma,
    };
  },
});

const server = Bun.serve({
  port: 4000,
  fetch: (request: Request) => yoga.fetch(request),
});

console.log(`🚀 Support Ticket SLA GraphQL server ready at http://localhost:${server.port}/graphql`);
