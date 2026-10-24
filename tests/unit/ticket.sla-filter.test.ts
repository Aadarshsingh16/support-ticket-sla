import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prisma } from "../../src/lib/prisma.ts";
import { getTickets } from "../../src/services/ticket.service.ts";
import { fromIST, SLAState } from "../../src/services/sla.service.ts";
import { Role, TicketPriority, TicketStatus } from "../../generated/prisma/client.ts";

describe("Unit/Integration Tests: Ticket SLA State Filtering & Scopes", () => {
  const ts = Date.now();
  const reporter1Email = `rep1_sla_test_${ts}@example.com`;
  const reporter2Email = `rep2_sla_test_${ts}@example.com`;
  const agent1Email = `agent1_sla_test_${ts}@example.com`;
  const agent2Email = `agent2_sla_test_${ts}@example.com`;

  let rep1Id = "";
  let rep2Id = "";
  let agent1Id = "";
  let agent2Id = "";

  const createdTicketIds: string[] = [];

  beforeAll(async () => {
    // 1. Create test users
    const r1 = await prisma.user.create({
      data: { name: "Reporter 1", email: reporter1Email, passwordHash: "hash123", role: Role.REPORTER },
    });
    rep1Id = r1.id;

    const r2 = await prisma.user.create({
      data: { name: "Reporter 2", email: reporter2Email, passwordHash: "hash123", role: Role.REPORTER },
    });
    rep2Id = r2.id;

    const a1 = await prisma.user.create({
      data: { name: "Agent 1", email: agent1Email, passwordHash: "hash123", role: Role.AGENT },
    });
    agent1Id = a1.id;

    const a2 = await prisma.user.create({
      data: { name: "Agent 2", email: agent2Email, passwordHash: "hash123", role: Role.AGENT },
    });
    agent2Id = a2.id;

    // 2. Create tickets with deterministic timestamps and SLA states
    // T1: Fresh LOW ticket (created 10 min ago) -> ON_TRACK
    const t1 = await prisma.ticket.create({
      data: {
        title: "Frontend design alignment ticket",
        description: "CSS styling adjustment needed",
        priority: TicketPriority.LOW,
        status: TicketStatus.OPEN,
        reporterId: rep1Id,
        assigneeId: agent1Id,
        createdAt: new Date(),
      },
    });
    createdTicketIds.push(t1.id);

    // T2: URGENT ticket created 10 days ago without response -> BREACHED
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const t2 = await prisma.ticket.create({
      data: {
        title: "Production database deadlock",
        description: "Deadlocks occurring under peak write traffic",
        priority: TicketPriority.URGENT,
        status: TicketStatus.IN_PROGRESS,
        reporterId: rep1Id,
        assigneeId: agent1Id,
        createdAt: pastDate,
      },
    });
    createdTicketIds.push(t2.id);

    // T3: URGENT ticket resolved today (10 days later) -> BREACHED resolution
    const t3 = await prisma.ticket.create({
      data: {
        title: "Payment webhook timeout issue",
        description: "Webhook processing exceeds timeout",
        priority: TicketPriority.URGENT,
        status: TicketStatus.RESOLVED,
        reporterId: rep1Id,
        assigneeId: agent2Id,
        createdAt: pastDate,
        firstRespondedAt: new Date(pastDate.getTime() + 30 * 60 * 1000),
        resolvedAt: new Date(), // Resolved 10 days later -> definitely BREACHED
      },
    });
    createdTicketIds.push(t3.id);

    // T4: Ticket belonging to Reporter 2 -> to test isolation
    const t4 = await prisma.ticket.create({
      data: {
        title: "Reporter 2 private ticket",
        description: "Must never be visible to Reporter 1",
        priority: TicketPriority.MEDIUM,
        status: TicketStatus.OPEN,
        reporterId: rep2Id,
        assigneeId: agent2Id,
        createdAt: new Date(),
      },
    });
    createdTicketIds.push(t4.id);
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

  it("1. should filter tickets by slaState: ON_TRACK", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets({ slaState: SLAState.ON_TRACK }, rep1Auth);

    expect(res.nodes.length).toBeGreaterThanOrEqual(1);
    expect(res.nodes.some((t) => t.title === "Frontend design alignment ticket")).toBe(true);
    // Must only contain tickets where at least one SLA is ON_TRACK
    for (const t of res.nodes) {
      expect(t.sla.responseState === SLAState.ON_TRACK || t.sla.resolutionState === SLAState.ON_TRACK).toBe(true);
    }
  });

  it("2. should filter tickets by slaState: BREACHED", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets({ slaState: SLAState.BREACHED }, rep1Auth);

    expect(res.nodes.length).toBeGreaterThanOrEqual(1);
    expect(res.nodes.some((t) => t.title === "Production database deadlock")).toBe(true);
    for (const t of res.nodes) {
      expect(t.sla.responseState === SLAState.BREACHED || t.sla.resolutionState === SLAState.BREACHED).toBe(true);
    }
  });

  it("3. should filter tickets by slaState: AT_RISK", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets({ slaState: SLAState.AT_RISK }, rep1Auth);

    // If none at risk, returns clean empty array without errors
    expect(Array.isArray(res.nodes)).toBe(true);
    for (const t of res.nodes) {
      expect(t.sla.responseState === SLAState.AT_RISK || t.sla.resolutionState === SLAState.AT_RISK).toBe(true);
    }
  });

  it("4. should combine SLA state with status filter", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets(
      { slaState: SLAState.BREACHED, status: TicketStatus.IN_PROGRESS },
      rep1Auth
    );

    expect(res.nodes.some((t) => t.title === "Production database deadlock")).toBe(true);
    expect(res.nodes.every((t) => t.status === TicketStatus.IN_PROGRESS)).toBe(true);
  });

  it("5. should combine SLA state with priority filter", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets(
      { slaState: SLAState.BREACHED, priority: TicketPriority.URGENT },
      rep1Auth
    );

    expect(res.nodes.some((t) => t.title === "Production database deadlock")).toBe(true);
    expect(res.nodes.every((t) => t.priority === TicketPriority.URGENT)).toBe(true);
  });

  it("6. should combine SLA state with search substring filter", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets(
      { slaState: SLAState.BREACHED, search: "deadlock" },
      rep1Auth
    );

    expect(res.nodes.length).toBe(1);
    expect(res.nodes[0]?.title).toBe("Production database deadlock");
  });

  it("7. should combine SLA state with assigneeId filter", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets(
      { slaState: SLAState.BREACHED, assigneeId: agent1Id },
      rep1Auth
    );

    expect(res.nodes.some((t) => t.title === "Production database deadlock")).toBe(true);
    expect(res.nodes.every((t) => t.assigneeId === agent1Id)).toBe(true);
  });

  it("8. should strictly enforce Reporter authorization isolation", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets({ slaState: SLAState.ON_TRACK }, rep1Auth);

    // Reporter 1 must NEVER see Reporter 2's tickets
    expect(res.nodes.some((t) => t.title === "Reporter 2 private ticket")).toBe(false);
    expect(res.nodes.every((t) => t.reporterId === rep1Id)).toBe(true);
  });

  it("9. should strictly enforce Agent authorization isolation", async () => {
    const agent1Auth = { userId: agent1Id, email: agent1Email, role: Role.AGENT };
    const res = await getTickets({ slaState: SLAState.BREACHED }, agent1Auth);

    // Agent 1 must only see tickets assigned to Agent 1
    expect(res.nodes.every((t) => t.assigneeId === agent1Id)).toBe(true);
  });

  it("10. should paginate SLA-filtered tickets without duplicates", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    // Page 1 with first: 1
    const page1 = await getTickets({ first: 1, slaState: SLAState.BREACHED }, rep1Auth);
    expect(page1.nodes.length).toBe(1);
    expect(page1.pageInfo.hasNextPage).toBe(true);
    expect(page1.pageInfo.endCursor).not.toBeNull();

    // Page 2
    const page2 = await getTickets(
      { first: 1, after: page1.pageInfo.endCursor, slaState: SLAState.BREACHED },
      rep1Auth
    );
    expect(page2.nodes.length).toBe(1);
    // Page 2 item must NOT be the same as Page 1 item
    expect(page2.nodes[0]?.id).not.toBe(page1.nodes[0]?.id);
  });

  it("11. should return empty connection when no tickets match SLA filter", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets(
      { slaState: SLAState.BREACHED, search: "NonExistentTicketQueryString12345" },
      rep1Auth
    );

    expect(res.nodes.length).toBe(0);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res.pageInfo.endCursor).toBeNull();
  });

  it("12. should reject unauthenticated requests", async () => {
    expect(getTickets({ slaState: SLAState.ON_TRACK }, null)).rejects.toThrow(
      "You must be logged in to perform this action."
    );
  });

  it("13. should reject invalid SLA state filter with BAD_USER_INPUT", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    expect(
      getTickets({ slaState: "INVALID_STATE" as any }, rep1Auth)
    ).rejects.toThrow("Invalid SLA state filter provided.");
  });

  it("14. should continue normal filtering when slaState is omitted", async () => {
    const rep1Auth = { userId: rep1Id, email: reporter1Email, role: Role.REPORTER };
    const res = await getTickets({ status: TicketStatus.OPEN }, rep1Auth);

    expect(res.nodes.length).toBeGreaterThanOrEqual(1);
    expect(res.nodes.every((t) => t.status === TicketStatus.OPEN)).toBe(true);
  });
});
