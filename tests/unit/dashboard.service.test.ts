import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../../src/lib/prisma.ts";
import { getDashboard } from "../../src/services/dashboard.service.ts";
import { Role, TicketPriority, TicketStatus } from "../../generated/prisma/client.ts";

describe("Unit/Service Tests: Dashboard Statistics & Authorization Partitioning", () => {
  const ts = Date.now();
  const reporter1Email = `dash_rep1_${ts}@example.com`;
  const reporter2Email = `dash_rep2_${ts}@example.com`;
  const agent1Email = `dash_agent1_${ts}@example.com`;
  const agent2Email = `dash_agent2_${ts}@example.com`;

  let rep1Id = "";
  let rep2Id = "";
  let agent1Id = "";
  let agent2Id = "";

  const createdTicketIds: string[] = [];

  beforeAll(async () => {
    // 1. Create test users
    const r1 = await prisma.user.create({
      data: { name: "Dashboard Reporter 1", email: reporter1Email, passwordHash: "hash123", role: Role.REPORTER },
    });
    rep1Id = r1.id;

    const r2 = await prisma.user.create({
      data: { name: "Dashboard Reporter 2", email: reporter2Email, passwordHash: "hash123", role: Role.REPORTER },
    });
    rep2Id = r2.id;

    const a1 = await prisma.user.create({
      data: { name: "Dashboard Agent 1", email: agent1Email, passwordHash: "hash123", role: Role.AGENT },
    });
    agent1Id = a1.id;

    const a2 = await prisma.user.create({
      data: { name: "Dashboard Agent 2", email: agent2Email, passwordHash: "hash123", role: Role.AGENT },
    });
    agent2Id = a2.id;

    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    // Reporter 1 Tickets:
    // T1: OPEN (LOW) -> ON_TRACK
    const t1 = await prisma.ticket.create({
      data: {
        title: "Rep1 Open Ticket",
        description: "Open status ticket",
        priority: TicketPriority.LOW,
        status: TicketStatus.OPEN,
        reporterId: rep1Id,
        assigneeId: agent1Id,
        createdAt: new Date(),
      },
    });
    createdTicketIds.push(t1.id);

    // T2: IN_PROGRESS (URGENT past deadline) -> BREACHED
    const t2 = await prisma.ticket.create({
      data: {
        title: "Rep1 In Progress Breached Ticket",
        description: "In progress breached",
        priority: TicketPriority.URGENT,
        status: TicketStatus.IN_PROGRESS,
        reporterId: rep1Id,
        assigneeId: agent1Id,
        createdAt: pastDate,
      },
    });
    createdTicketIds.push(t2.id);

    // T3: RESOLVED (URGENT resolved 10 days later) -> RESOLVED & BREACHED
    const t3 = await prisma.ticket.create({
      data: {
        title: "Rep1 Resolved Breached Ticket",
        description: "Resolved breached",
        priority: TicketPriority.URGENT,
        status: TicketStatus.RESOLVED,
        reporterId: rep1Id,
        assigneeId: agent1Id,
        createdAt: pastDate,
        firstRespondedAt: new Date(pastDate.getTime() + 30 * 60 * 1000),
        resolvedAt: new Date(), // Resolved today (10 days later) -> BREACHED
      },
    });
    createdTicketIds.push(t3.id);

    // T4: CLOSED (LOW on track) -> CLOSED
    const t4 = await prisma.ticket.create({
      data: {
        title: "Rep1 Closed Ticket",
        description: "Closed ticket",
        priority: TicketPriority.LOW,
        status: TicketStatus.CLOSED,
        reporterId: rep1Id,
        assigneeId: agent1Id,
        createdAt: new Date(),
        firstRespondedAt: new Date(),
        resolvedAt: new Date(),
      },
    });
    createdTicketIds.push(t4.id);

    // Reporter 2 Tickets (Assigned to Agent 2):
    // T5: OPEN (MEDIUM)
    const t5 = await prisma.ticket.create({
      data: {
        title: "Rep2 Open Ticket",
        description: "Reporter 2 private ticket",
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        reporterId: rep2Id,
        assigneeId: agent2Id,
        createdAt: new Date(),
      },
    });
    createdTicketIds.push(t5.id);
  });

  afterAll(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.comment.deleteMany({ where: { ticketId: { in: createdTicketIds } } });
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    if (rep1Id) await prisma.user.deleteMany({ where: { id: rep1Id } });
    if (rep2Id) await prisma.user.deleteMany({ where: { id: rep2Id } });
    if (agent1Id) await prisma.user.deleteMany({ where: { id: agent1Id } });
    if (agent2Id) await prisma.user.deleteMany({ where: { id: agent2Id } });
  });

  it("1. should reject unauthenticated dashboard query with UNAUTHENTICATED error", async () => {
    expect(getDashboard(null)).rejects.toThrow("You must be logged in to perform this action.");
  });

  it("2. should calculate correct status counts for Reporter 1", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const stats = await getDashboard(rep1Auth);

    expect(stats.openTickets).toBe(1);
    expect(stats.inProgressTickets).toBe(1);
    expect(stats.resolvedTickets).toBe(1);
    expect(stats.closedTickets).toBe(1);
  });

  it("3. should calculate correct dynamic SLA counts for Reporter 1", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const stats = await getDashboard(rep1Auth);

    // T2 and T3 are breached
    expect(stats.breachedTickets).toBe(2);
    // T1 and T4 are on track, none at risk in this fixture
    expect(stats.atRiskTickets).toBe(0);
  });

  it("4. should enforce Reporter authorization isolation (does not see Reporter 2's tickets)", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const rep2Auth = { userId: rep2Id, email: reporter2Email, role: Role.REPORTER };

    const rep1Stats = await getDashboard(rep1Auth);
    const rep2Stats = await getDashboard(rep2Auth);

    // Reporter 1 has 1 open ticket (T1)
    expect(rep1Stats.openTickets).toBe(1);

    // Reporter 2 has 1 open ticket (T5) and 0 in progress/resolved/closed
    expect(rep2Stats.openTickets).toBe(1);
    expect(rep2Stats.inProgressTickets).toBe(0);
    expect(rep2Stats.resolvedTickets).toBe(0);
    expect(rep2Stats.closedTickets).toBe(0);
    expect(rep2Stats.breachedTickets).toBe(0);
  });

  it("5. should calculate assigned tickets for Agent 1", async () => {
    const agent1Auth = { userId: agent1Id, email: agent1Email, role: Role.AGENT };
    const stats = await getDashboard(agent1Auth);

    // Agent 1 is assigned T1, T2, T3, T4
    expect(stats.openTickets).toBe(1);
    expect(stats.inProgressTickets).toBe(1);
    expect(stats.resolvedTickets).toBe(1);
    expect(stats.closedTickets).toBe(1);
    expect(stats.breachedTickets).toBe(2);
  });

  it("6. should enforce Agent authorization isolation (Agent 2 only sees T5)", async () => {
    const agent2Auth = { userId: agent2Id, email: agent2Email, role: Role.AGENT };
    const stats = await getDashboard(agent2Auth);

    // Agent 2 is only assigned T5 (OPEN)
    expect(stats.openTickets).toBe(1);
    expect(stats.inProgressTickets).toBe(0);
    expect(stats.resolvedTickets).toBe(0);
    expect(stats.closedTickets).toBe(0);
    expect(stats.breachedTickets).toBe(0);
  });

  it("7. should return all zeros for a user with no tickets", async () => {
    const emptyAuth = { userId: "non-existent-user-id", email: "empty@example.com", role: Role.REPORTER };
    const stats = await getDashboard(emptyAuth);

    expect(stats.openTickets).toBe(0);
    expect(stats.inProgressTickets).toBe(0);
    expect(stats.resolvedTickets).toBe(0);
    expect(stats.closedTickets).toBe(0);
    expect(stats.atRiskTickets).toBe(0);
    expect(stats.breachedTickets).toBe(0);
  });

  it("8. should not double-count a ticket that has both response and resolution breached", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const stats = await getDashboard(rep1Auth);

    // T2 is breached for both response and resolution (past deadline)
    // T3 is breached for resolution
    // Total breached count must be exactly 2, not 3
    expect(stats.breachedTickets).toBe(2);
  });
});
