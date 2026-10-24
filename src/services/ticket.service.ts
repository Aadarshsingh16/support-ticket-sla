import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma.ts";
import {
  Role,
  TicketPriority,
  TicketStatus,
  type User,
  type Ticket,
  type Comment,
  type Prisma,
} from "../../generated/prisma/client.ts";
import type { AuthTokenPayload } from "../utils/auth.ts";
import {
  calculateTicketSLA,
  fetchHolidaysSet,
  SLAState,
  type SLAInfo,
} from "./sla.service.ts";

export interface CreateTicketInput {
  title: string;
  description: string;
  priority: TicketPriority;
}

export interface UpdateTicketInput {
  id: string;
  title?: string | null;
  description?: string | null;
  priority?: TicketPriority | null;
  status?: TicketStatus | null;
}

export interface SafeUserResult {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface CommentResult {
  id: string;
  ticketId: string;
  authorId: string;
  author: SafeUserResult;
  body: string;
  createdAt: string;
}

export interface TicketResult {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  reporterId: string;
  assigneeId: string | null;
  reporter: SafeUserResult;
  assignee: SafeUserResult | null;
  createdAt: string;
  updatedAt: string;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  comments: CommentResult[];
  sla: SLAInfo;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface TicketConnection {
  nodes: TicketResult[];
  pageInfo: PageInfo;
}

export interface GetTicketsArgs {
  first?: number | null;
  after?: string | null;
  search?: string | null;
  status?: TicketStatus | null;
  priority?: TicketPriority | null;
  assigneeId?: string | null;
  slaState?: SLAState | null;
}

type TicketWithRelations = Ticket & {
  reporter: User;
  assignee: User | null;
  comments: (Comment & {
    author: User;
  })[];
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface DecodedCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(ticket: { createdAt: Date | string; id: string }): string {
  const isoString =
    ticket.createdAt instanceof Date
      ? ticket.createdAt.toISOString()
      : ticket.createdAt;
  const payload: DecodedCursor = {
    createdAt: isoString,
    id: ticket.id,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const json = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["createdAt"] !== "string" ||
      typeof (parsed as Record<string, unknown>)["id"] !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }
    const createdAt = new Date(
      (parsed as Record<string, unknown>)["createdAt"] as string
    );
    if (isNaN(createdAt.getTime())) {
      throw new Error("Invalid cursor date");
    }
    return {
      createdAt,
      id: (parsed as Record<string, unknown>)["id"] as string,
    };
  } catch {
    throw new GraphQLError("Invalid cursor provided.", {
      extensions: { code: "BAD_USER_INPUT", field: "after" },
    });
  }
}

function formatUser(user: User): SafeUserResult {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function formatTicket(
  ticket: TicketWithRelations,
  holidays?: Set<string>
): Promise<TicketResult> {
  const sla = await calculateTicketSLA(ticket, holidays);

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    reporterId: ticket.reporterId,
    assigneeId: ticket.assigneeId,
    reporter: formatUser(ticket.reporter),
    assignee: ticket.assignee ? formatUser(ticket.assignee) : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    firstRespondedAt: ticket.firstRespondedAt
      ? ticket.firstRespondedAt.toISOString()
      : null,
    resolvedAt: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    comments: ticket.comments.map((comment) => ({
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      author: formatUser(comment.author),
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    })),
    sla,
  };
}

function assertAuthenticated(authUser: AuthTokenPayload | null): AuthTokenPayload {
  if (!authUser) {
    throw new GraphQLError("You must be logged in to perform this action.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return authUser;
}

export async function createTicket(
  input: CreateTicketInput,
  authUser: AuthTokenPayload | null
): Promise<TicketResult> {
  const user = assertAuthenticated(authUser);

  const trimmedTitle = input.title?.trim();
  if (!trimmedTitle) {
    throw new GraphQLError("Title is required and cannot be empty.", {
      extensions: { code: "BAD_USER_INPUT", field: "title" },
    });
  }

  const trimmedDescription = input.description?.trim();
  if (!trimmedDescription) {
    throw new GraphQLError("Description is required and cannot be empty.", {
      extensions: { code: "BAD_USER_INPUT", field: "description" },
    });
  }

  if (!Object.values(TicketPriority).includes(input.priority)) {
    throw new GraphQLError("Invalid ticket priority provided.", {
      extensions: { code: "BAD_USER_INPUT", field: "priority" },
    });
  }

  const defaultAgent = await prisma.user.findFirst({
    where: { role: Role.AGENT },
    orderBy: { createdAt: "asc" },
  });

  const ticket = await prisma.ticket.create({
    data: {
      title: trimmedTitle,
      description: trimmedDescription,
      priority: input.priority,
      status: TicketStatus.OPEN,
      reporterId: user.userId,
      assigneeId: defaultAgent?.id ?? null,
    },
    include: {
      reporter: true,
      assignee: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return formatTicket(ticket);
}

export async function getTicketById(
  id: string,
  authUser: AuthTokenPayload | null
): Promise<TicketResult> {
  const user = assertAuthenticated(authUser);

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      reporter: true,
      assignee: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!ticket) {
    throw new GraphQLError("Ticket not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  if (user.role === Role.REPORTER && ticket.reporterId !== user.userId) {
    throw new GraphQLError("You do not have permission to view this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (user.role === Role.AGENT && ticket.assigneeId !== user.userId) {
    throw new GraphQLError("You do not have permission to view this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  return formatTicket(ticket);
}

export async function getTickets(
  args: GetTicketsArgs,
  authUser: AuthTokenPayload | null
): Promise<TicketConnection> {
  const user = assertAuthenticated(authUser);

  // 1. Validate page size (first)
  let limit = DEFAULT_PAGE_SIZE;
  if (args.first !== undefined && args.first !== null) {
    if (args.first <= 0 || args.first > MAX_PAGE_SIZE || !Number.isInteger(args.first)) {
      throw new GraphQLError(
        `'first' must be a positive integer between 1 and ${MAX_PAGE_SIZE}.`,
        { extensions: { code: "BAD_USER_INPUT", field: "first" } }
      );
    }
    limit = args.first;
  }

  const andConditions: Prisma.TicketWhereInput[] = [];

  // 2. Base authorization scope (REPORTER sees own, AGENT sees assigned)
  if (user.role === Role.REPORTER) {
    andConditions.push({ reporterId: user.userId });
  } else if (user.role === Role.AGENT) {
    andConditions.push({ assigneeId: user.userId });
  }

  // 3. Assignee filter validation & constraint
  if (args.assigneeId !== undefined && args.assigneeId !== null) {
    const targetAgent = await prisma.user.findUnique({
      where: { id: args.assigneeId },
    });
    if (!targetAgent) {
      throw new GraphQLError("Assignee user not found.", {
        extensions: { code: "NOT_FOUND", field: "assigneeId" },
      });
    }
    andConditions.push({ assigneeId: args.assigneeId });
  }

  // 4. Status filter
  if (args.status !== undefined && args.status !== null) {
    if (!Object.values(TicketStatus).includes(args.status)) {
      throw new GraphQLError("Invalid ticket status filter.", {
        extensions: { code: "BAD_USER_INPUT", field: "status" },
      });
    }
    andConditions.push({ status: args.status });
  }

  // 5. Priority filter
  if (args.priority !== undefined && args.priority !== null) {
    if (!Object.values(TicketPriority).includes(args.priority)) {
      throw new GraphQLError("Invalid ticket priority filter.", {
        extensions: { code: "BAD_USER_INPUT", field: "priority" },
      });
    }
    andConditions.push({ priority: args.priority });
  }

  // 6. Search filter (case-insensitive substring in title OR description)
  // Whitespace-only search is treated safely as no filter
  if (args.search !== undefined && args.search !== null) {
    const trimmedSearch = args.search.trim();
    if (trimmedSearch.length > 0) {
      andConditions.push({
        OR: [
          { title: { contains: trimmedSearch, mode: "insensitive" } },
          { description: { contains: trimmedSearch, mode: "insensitive" } },
        ],
      });
    }
  }

  // 7. SLA State filter validation
  if (args.slaState !== undefined && args.slaState !== null) {
    if (!Object.values(SLAState).includes(args.slaState)) {
      throw new GraphQLError("Invalid SLA state filter provided.", {
        extensions: { code: "BAD_USER_INPUT", field: "slaState" },
      });
    }
  }

  // 8. Cursor pagination condition (createdAt DESC, id DESC)
  if (args.after) {
    const cursor = decodeCursor(args.after);
    andConditions.push({
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        {
          createdAt: cursor.createdAt,
          id: { lt: cursor.id },
        },
      ],
    });
  }

  const holidays = await fetchHolidaysSet();

  // If slaState filter is provided, dynamically evaluate candidate tickets
  if (args.slaState) {
    const targetSlaState = args.slaState;
    const matchedTickets: TicketWithRelations[] = [];
    const batchSize = Math.max(limit * 3, 50);
    let currentConditions = [...andConditions];
    let hasMoreCandidates = true;

    while (matchedTickets.length <= limit && hasMoreCandidates) {
      const candidates: TicketWithRelations[] = await prisma.ticket.findMany({
        where: { AND: currentConditions },
        include: {
          reporter: true,
          assignee: true,
          comments: {
            include: { author: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: batchSize,
      });

      if (candidates.length === 0) {
        break;
      }

      if (candidates.length < batchSize) {
        hasMoreCandidates = false;
      }

      for (const candidate of candidates) {
        const sla = await calculateTicketSLA(candidate, holidays);
        if (
          sla.responseState === targetSlaState ||
          sla.resolutionState === targetSlaState
        ) {
          matchedTickets.push(candidate);
          if (matchedTickets.length > limit) {
            break;
          }
        }
      }

      const lastCandidate = candidates[candidates.length - 1];
      if (lastCandidate && hasMoreCandidates && matchedTickets.length <= limit) {
        // Exclude previous cursor condition and advance with lastCandidate cursor
        const baseConditions = andConditions.filter((c) => {
          if ("OR" in c && Array.isArray(c.OR)) {
            const firstBranch = c.OR[0];
            return !(firstBranch && "createdAt" in firstBranch);
          }
          return true;
        });

        baseConditions.push({
          OR: [
            { createdAt: { lt: lastCandidate.createdAt } },
            {
              createdAt: lastCandidate.createdAt,
              id: { lt: lastCandidate.id },
            },
          ],
        });

        currentConditions = baseConditions;
      } else {
        break;
      }
    }

    const hasNextPage = matchedTickets.length > limit;
    const nodesToReturn = hasNextPage
      ? matchedTickets.slice(0, limit)
      : matchedTickets;

    const formattedNodes = await Promise.all(
      nodesToReturn.map((t) => formatTicket(t, holidays))
    );

    const endCursor =
      nodesToReturn.length > 0
        ? encodeCursor(nodesToReturn[nodesToReturn.length - 1]!)
        : null;

    return {
      nodes: formattedNodes,
      pageInfo: {
        hasNextPage,
        endCursor,
      },
    };
  }

  // Standard path when slaState is not filtered
  const where: Prisma.TicketWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      reporter: true,
      assignee: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: limit + 1,
  });

  const hasNextPage = tickets.length > limit;
  const nodesToReturn = hasNextPage ? tickets.slice(0, limit) : tickets;

  const formattedNodes = await Promise.all(
    nodesToReturn.map((t) => formatTicket(t, holidays))
  );

  const endCursor =
    nodesToReturn.length > 0
      ? encodeCursor(nodesToReturn[nodesToReturn.length - 1]!)
      : null;

  return {
    nodes: formattedNodes,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
}

export async function updateTicket(
  input: UpdateTicketInput,
  authUser: AuthTokenPayload | null
): Promise<TicketResult> {
  const user = assertAuthenticated(authUser);

  const existingTicket = await prisma.ticket.findUnique({
    where: { id: input.id },
  });

  if (!existingTicket) {
    throw new GraphQLError("Ticket not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  // Authorization check
  if (user.role === Role.REPORTER && existingTicket.reporterId !== user.userId) {
    throw new GraphQLError("You do not have permission to update this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (user.role === Role.AGENT && existingTicket.assigneeId !== user.userId) {
    throw new GraphQLError("You do not have permission to update this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const data: {
    title?: string;
    description?: string;
    priority?: TicketPriority;
    status?: TicketStatus;
    resolvedAt?: Date | null;
  } = {};

  if (input.title !== undefined && input.title !== null) {
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      throw new GraphQLError("Title cannot be empty.", {
        extensions: { code: "BAD_USER_INPUT", field: "title" },
      });
    }
    data.title = trimmedTitle;
  }

  if (input.description !== undefined && input.description !== null) {
    const trimmedDescription = input.description.trim();
    if (!trimmedDescription) {
      throw new GraphQLError("Description cannot be empty.", {
        extensions: { code: "BAD_USER_INPUT", field: "description" },
      });
    }
    data.description = trimmedDescription;
  }

  if (input.priority !== undefined && input.priority !== null) {
    if (!Object.values(TicketPriority).includes(input.priority)) {
      throw new GraphQLError("Invalid ticket priority.", {
        extensions: { code: "BAD_USER_INPUT", field: "priority" },
      });
    }
    data.priority = input.priority;
  }

  if (input.status !== undefined && input.status !== null) {
    if (!Object.values(TicketStatus).includes(input.status)) {
      throw new GraphQLError("Invalid ticket status.", {
        extensions: { code: "BAD_USER_INPUT", field: "status" },
      });
    }

    const currentStatus = existingTicket.status;
    const nextStatus = input.status;

    if (currentStatus !== nextStatus) {
      if (nextStatus === TicketStatus.RESOLVED) {
        data.resolvedAt = new Date();
      } else if (
        currentStatus === TicketStatus.RESOLVED &&
        (nextStatus === TicketStatus.OPEN || nextStatus === TicketStatus.IN_PROGRESS)
      ) {
        data.resolvedAt = null;
      }
    }

    data.status = nextStatus;
  }

  const updatedTicket = await prisma.ticket.update({
    where: { id: input.id },
    data,
    include: {
      reporter: true,
      assignee: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return formatTicket(updatedTicket);
}

export async function deleteTicket(
  id: string,
  authUser: AuthTokenPayload | null
): Promise<boolean> {
  const user = assertAuthenticated(authUser);

  const existingTicket = await prisma.ticket.findUnique({
    where: { id },
  });

  if (!existingTicket) {
    throw new GraphQLError("Ticket not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  // Authorization check
  if (user.role === Role.REPORTER && existingTicket.reporterId !== user.userId) {
    throw new GraphQLError("You do not have permission to delete this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (user.role === Role.AGENT && existingTicket.assigneeId !== user.userId) {
    throw new GraphQLError("You do not have permission to delete this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  await prisma.ticket.delete({
    where: { id },
  });

  return true;
}

export async function assignTicket(
  ticketId: string,
  agentId: string,
  authUser: AuthTokenPayload | null
): Promise<TicketResult> {
  const user = assertAuthenticated(authUser);

  if (user.role !== Role.AGENT) {
    throw new GraphQLError("Only agents are permitted to assign tickets.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) {
    throw new GraphQLError("Ticket not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  const targetAgent = await prisma.user.findUnique({
    where: { id: agentId },
  });

  if (!targetAgent) {
    throw new GraphQLError("Target agent user not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  if (targetAgent.role !== Role.AGENT) {
    throw new GraphQLError("Tickets can only be assigned to users with the AGENT role.", {
      extensions: { code: "BAD_USER_INPUT", field: "agentId" },
    });
  }

  const updatedTicket = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assigneeId: agentId,
    },
    include: {
      reporter: true,
      assignee: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return formatTicket(updatedTicket);
}

export async function addComment(
  ticketId: string,
  body: string,
  authUser: AuthTokenPayload | null
): Promise<CommentResult> {
  const user = assertAuthenticated(authUser);

  const trimmedBody = body?.trim();
  if (!trimmedBody) {
    throw new GraphQLError("Comment body is required and cannot be empty.", {
      extensions: { code: "BAD_USER_INPUT", field: "body" },
    });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket) {
    throw new GraphQLError("Ticket not found.", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  if (user.role === Role.REPORTER && ticket.reporterId !== user.userId) {
    throw new GraphQLError("You do not have permission to comment on this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (user.role === Role.AGENT && ticket.assigneeId !== user.userId) {
    throw new GraphQLError("You do not have permission to comment on this ticket.", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (user.role === Role.AGENT && ticket.firstRespondedAt === null) {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        firstRespondedAt: new Date(),
      },
    });
  }

  const comment = await prisma.comment.create({
    data: {
      ticketId,
      authorId: user.userId,
      body: trimmedBody,
    },
    include: {
      author: true,
    },
  });

  return {
    id: comment.id,
    ticketId: comment.ticketId,
    authorId: comment.authorId,
    author: formatUser(comment.author),
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
  };
}
