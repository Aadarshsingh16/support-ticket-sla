import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma.ts";
import {
  Role,
  TicketPriority,
  TicketStatus,
  type User,
  type Ticket,
  type Comment,
} from "../../generated/prisma/client.ts";
import type { AuthTokenPayload } from "../utils/auth.ts";
import {
  calculateTicketSLA,
  fetchHolidaysSet,
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

type TicketWithRelations = Ticket & {
  reporter: User;
  assignee: User | null;
  comments: (Comment & {
    author: User;
  })[];
};

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

  const ticket = await prisma.ticket.create({
    data: {
      title: trimmedTitle,
      description: trimmedDescription,
      priority: input.priority,
      status: TicketStatus.OPEN,
      reporterId: user.userId,
      assigneeId: null,
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

  // Authorization check based on role
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
  authUser: AuthTokenPayload | null
): Promise<TicketResult[]> {
  const user = assertAuthenticated(authUser);

  let tickets: TicketWithRelations[] = [];

  if (user.role === Role.REPORTER) {
    tickets = await prisma.ticket.findMany({
      where: { reporterId: user.userId },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  } else if (user.role === Role.AGENT) {
    tickets = await prisma.ticket.findMany({
      where: { assigneeId: user.userId },
      include: {
        reporter: true,
        assignee: true,
        comments: {
          include: { author: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const holidays = await fetchHolidaysSet();
  return Promise.all(tickets.map((t) => formatTicket(t, holidays)));
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
