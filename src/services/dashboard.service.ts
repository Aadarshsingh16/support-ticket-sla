/**
 * Dashboard Service for Support Ticket & SLA Tracker
 *
 * Requirements:
 * - Aggregates ticket status counts (OPEN, IN_PROGRESS, RESOLVED, CLOSED)
 * - Dynamically evaluates SLA states (AT_RISK, BREACHED) without database columns
 * - Strictly enforces role-based partition isolation (Reporter sees own, Agent sees assigned)
 * - Prevents double counting of tickets across SLA categories
 */

import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma.ts";
import { Role, TicketStatus, type Prisma } from "../../generated/prisma/client.ts";
import type { AuthTokenPayload } from "../utils/auth.ts";
import { calculateTicketSLA, fetchHolidaysSet, SLAState } from "./sla.service.ts";

export interface TicketDashboardResult {
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
}

function assertAuthenticated(authUser: AuthTokenPayload | null): AuthTokenPayload {
  if (!authUser) {
    throw new GraphQLError("You must be logged in to perform this action.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return authUser;
}

export async function getDashboard(
  authUser: AuthTokenPayload | null,
  currentTime?: Date
): Promise<TicketDashboardResult> {
  const user = assertAuthenticated(authUser);

  // 1. Determine role-based visibility filter
  const baseCondition: Prisma.TicketWhereInput =
    user.role === Role.REPORTER
      ? { reporterId: user.userId }
      : { assigneeId: user.userId };

  // 2. Perform database grouping for status counts
  const statusGroups = await prisma.ticket.groupBy({
    by: ["status"],
    where: baseCondition,
    _count: {
      _all: true,
    },
  });

  let openTickets = 0;
  let inProgressTickets = 0;
  let resolvedTickets = 0;
  let closedTickets = 0;

  for (const group of statusGroups) {
    switch (group.status) {
      case TicketStatus.OPEN:
        openTickets = group._count._all;
        break;
      case TicketStatus.IN_PROGRESS:
        inProgressTickets = group._count._all;
        break;
      case TicketStatus.RESOLVED:
        resolvedTickets = group._count._all;
        break;
      case TicketStatus.CLOSED:
        closedTickets = group._count._all;
        break;
    }
  }

  // 3. Fetch candidate tickets within authorized scope for dynamic SLA evaluation
  const candidateTickets = await prisma.ticket.findMany({
    where: baseCondition,
    select: {
      createdAt: true,
      priority: true,
      status: true,
      firstRespondedAt: true,
      resolvedAt: true,
      updatedAt: true,
    },
  });

  // 4. In-memory dynamic SLA evaluation
  const holidays = await fetchHolidaysSet();
  const now = currentTime ?? new Date();

  let atRiskTickets = 0;
  let breachedTickets = 0;

  for (const ticket of candidateTickets) {
    const sla = await calculateTicketSLA(ticket, holidays, now);

    // If either response SLA or resolution SLA is breached -> count as BREACHED
    if (
      sla.responseState === SLAState.BREACHED ||
      sla.resolutionState === SLAState.BREACHED
    ) {
      breachedTickets++;
    }
    // Otherwise, if either response or resolution is at-risk -> count as AT_RISK (no double-counting)
    else if (
      sla.responseState === SLAState.AT_RISK ||
      sla.resolutionState === SLAState.AT_RISK
    ) {
      atRiskTickets++;
    }
  }

  return {
    openTickets,
    inProgressTickets,
    resolvedTickets,
    closedTickets,
    atRiskTickets,
    breachedTickets,
  };
}
