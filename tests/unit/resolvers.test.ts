import { describe, it, expect } from "bun:test";
import { resolvers } from "../../src/graphql/resolvers/index.ts";
import { prisma } from "../../src/lib/prisma.ts";
import { Role, TicketPriority, TicketStatus } from "../../generated/prisma/client.ts";
import type { GraphQLContext } from "../../src/utils/auth.ts";

describe("Unit Tests: GraphQL Resolvers", () => {
  const unauthenticatedContext: GraphQLContext = {
    user: null,
    prisma,
  };

  const reporterContext: GraphQLContext = {
    user: {
      userId: "rep-user-1",
      email: "reporter@example.com",
      role: Role.REPORTER,
    },
    prisma,
  };

  const agentContext: GraphQLContext = {
    user: {
      userId: "agent-user-1",
      email: "agent@example.com",
      role: Role.AGENT,
    },
    prisma,
  };

  describe("Query Resolvers", () => {
    it("Query.health should return API health string", () => {
      const result = resolvers.Query.health();
      expect(result).toBe("Support Ticket SLA API is running");
    });

    it("Query.me should return null when unauthenticated", async () => {
      const result = await resolvers.Query.me({}, {}, unauthenticatedContext);
      expect(result).toBeNull();
    });

    it("Query.ticket should reject unauthenticated requests", async () => {
      expect(
        resolvers.Query.ticket({}, { id: "ticket-1" }, unauthenticatedContext)
      ).rejects.toThrow("You must be logged in to perform this action.");
    });

    it("Query.tickets should reject unauthenticated requests", async () => {
      expect(
        resolvers.Query.tickets({}, {}, unauthenticatedContext)
      ).rejects.toThrow("You must be logged in to perform this action.");
    });

    it("Query.dashboard should reject unauthenticated requests", async () => {
      expect(
        resolvers.Query.dashboard({}, {}, unauthenticatedContext)
      ).rejects.toThrow("You must be logged in to perform this action.");
    });
  });

  describe("Mutation Resolvers: Authorization & Arguments", () => {
    it("Mutation.createTicket should reject unauthenticated requests", async () => {
      expect(
        resolvers.Mutation.createTicket(
          {},
          { title: "Test", description: "Desc", priority: TicketPriority.HIGH },
          unauthenticatedContext
        )
      ).rejects.toThrow("You must be logged in to perform this action.");
    });

    it("Mutation.updateTicket should reject unauthenticated requests", async () => {
      expect(
        resolvers.Mutation.updateTicket(
          {},
          { id: "ticket-1", status: TicketStatus.IN_PROGRESS },
          unauthenticatedContext
        )
      ).rejects.toThrow("You must be logged in to perform this action.");
    });

    it("Mutation.deleteTicket should reject unauthenticated requests", async () => {
      expect(
        resolvers.Mutation.deleteTicket(
          {},
          { id: "ticket-1" },
          unauthenticatedContext
        )
      ).rejects.toThrow("You must be logged in to perform this action.");
    });

    it("Mutation.assignTicket should reject non-AGENT callers with FORBIDDEN", async () => {
      expect(
        resolvers.Mutation.assignTicket(
          {},
          { ticketId: "ticket-1", agentId: "agent-2" },
          reporterContext
        )
      ).rejects.toThrow("Only agents are permitted to assign tickets.");
    });

    it("Mutation.addComment should reject unauthenticated callers", async () => {
      expect(
        resolvers.Mutation.addComment(
          {},
          { ticketId: "ticket-1", body: "Hello" },
          unauthenticatedContext
        )
      ).rejects.toThrow("You must be logged in to perform this action.");
    });
  });
});
