import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../../src/lib/prisma.ts";
import { resolvers } from "../../src/graphql/resolvers/index.ts";
import { Role, TicketPriority, TicketStatus } from "../../generated/prisma/client.ts";
import type { GraphQLContext } from "../../src/utils/auth.ts";

describe("Integration Tests: Real PostgreSQL & GraphQL Pipeline", () => {
  const timestamp = Date.now();
  const reporterEmail = `integration_rep_${timestamp}@example.com`;
  const agentEmail = `integration_agent_${timestamp}@example.com`;

  let reporterId = "";
  let agentId = "";
  let reporterContext: GraphQLContext;
  let agentContext: GraphQLContext;
  let createdTicketId = "";

  beforeAll(async () => {
    // 1. Create reporter via resolvers.Mutation.register
    const repRes = await resolvers.Mutation.register(
      {},
      { name: "Integration Reporter", email: reporterEmail, password: "Password123!" }
    );
    reporterId = repRes.user.id;
    reporterContext = {
      user: {
        userId: reporterId,
        email: reporterEmail,
        role: Role.REPORTER,
      },
      prisma,
    };

    // 2. Create agent via resolvers.Mutation.register and elevate role
    const agentRes = await resolvers.Mutation.register(
      {},
      { name: "Integration Agent", email: agentEmail, password: "Password123!" }
    );
    agentId = agentRes.user.id;
    await prisma.user.update({
      where: { id: agentId },
      data: { role: Role.AGENT },
    });
    agentContext = {
      user: {
        userId: agentId,
        email: agentEmail,
        role: Role.AGENT,
      },
      prisma,
    };
  });

  afterAll(async () => {
    // Clean up created test data safely
    if (createdTicketId) {
      await prisma.comment.deleteMany({ where: { ticketId: createdTicketId } });
      await prisma.ticket.deleteMany({ where: { id: createdTicketId } });
    }
    if (reporterId) {
      await prisma.user.deleteMany({ where: { id: reporterId } });
    }
    if (agentId) {
      await prisma.user.deleteMany({ where: { id: agentId } });
    }
  });

  it("1. should create a ticket in real PostgreSQL through GraphQL mutation", async () => {
    const result = await resolvers.Mutation.createTicket(
      {},
      {
        title: "Database connection dropped under high throughput",
        description: "Connection pool exhausted during peak ETL processing.",
        priority: TicketPriority.URGENT,
      },
      reporterContext
    );

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.title).toBe("Database connection dropped under high throughput");
    expect(result.status).toBe(TicketStatus.OPEN);
    expect(result.priority).toBe(TicketPriority.URGENT);
    expect(result.reporter.id).toBe(reporterId);
    expect(result.sla).toBeDefined();
    expect(result.sla.responseState).toBeDefined();

    createdTicketId = result.id;

    // Verify record actually exists in PostgreSQL
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: createdTicketId },
    });
    expect(dbTicket).not.toBeNull();
    expect(dbTicket?.title).toBe("Database connection dropped under high throughput");
  });

  it("2. should read the ticket back with nested relations and computed SLA", async () => {
    const result = await resolvers.Query.ticket(
      {},
      { id: createdTicketId },
      reporterContext
    );

    expect(result.id).toBe(createdTicketId);
    expect(result.reporter.email).toBe(reporterEmail);
    expect(result.sla.responseDueAt).toBeDefined();
    expect(result.sla.resolutionDueAt).toBeDefined();
  });

  it("3. should allow agent to be assigned to the ticket", async () => {
    const result = await resolvers.Mutation.assignTicket(
      {},
      { ticketId: createdTicketId, agentId },
      agentContext
    );

    expect(result.assigneeId).toBe(agentId);
    expect(result.assignee?.name).toBe("Integration Agent");

    // Verify persisted in PostgreSQL
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: createdTicketId },
    });
    expect(dbTicket?.assigneeId).toBe(agentId);
  });

  it("4. should track first response timestamp when assigned agent comments", async () => {
    const comment = await resolvers.Mutation.addComment(
      {},
      { ticketId: createdTicketId, body: "Investigating the connection pool size." },
      agentContext
    );

    expect(comment.body).toBe("Investigating the connection pool size.");
    expect(comment.author.id).toBe(agentId);

    // Verify firstRespondedAt is now recorded on the ticket in PostgreSQL
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: createdTicketId },
    });
    expect(dbTicket?.firstRespondedAt).not.toBeNull();
  });

  it("5. should update ticket status and record resolvedAt in PostgreSQL", async () => {
    const result = await resolvers.Mutation.updateTicket(
      {},
      { id: createdTicketId, status: TicketStatus.RESOLVED },
      agentContext
    );

    expect(result.status).toBe(TicketStatus.RESOLVED);
    expect(result.resolvedAt).not.toBeNull();

    // Verify in PostgreSQL
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: createdTicketId },
    });
    expect(dbTicket?.status).toBe(TicketStatus.RESOLVED);
    expect(dbTicket?.resolvedAt).not.toBeNull();
  });

  it("6. should return paginated connection from real PostgreSQL", async () => {
    const connection = await resolvers.Query.tickets(
      {},
      { first: 10, search: "ETL" },
      agentContext
    );

    expect(connection.nodes.length).toBeGreaterThanOrEqual(1);
    expect(connection.nodes[0]?.id).toBe(createdTicketId);
    expect(connection.pageInfo.hasNextPage).toBe(false);
  });
});
