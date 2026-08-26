import {
  register,
  login,
  getMe,
  type RegisterInput,
  type LoginInput,
  type AuthResponse,
  type SafeUser,
} from "../../services/auth.service.ts";
import {
  createTicket,
  getTicketById,
  getTickets,
  updateTicket,
  deleteTicket,
  assignTicket,
  addComment,
  type CreateTicketInput,
  type UpdateTicketInput,
  type GetTicketsArgs,
  type TicketResult,
  type TicketConnection,
  type CommentResult,
} from "../../services/ticket.service.ts";
import {
  getDashboard,
  type TicketDashboardResult,
} from "../../services/dashboard.service.ts";
import type { GraphQLContext } from "../../utils/auth.ts";

export const resolvers = {
  Query: {
    health: (): string => "Support Ticket SLA API is running",
    me: async (
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ): Promise<SafeUser | null> => {
      if (!context.user) {
        return null;
      }
      return getMe(context.user.userId);
    },
    ticket: async (
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ): Promise<TicketResult> => {
      return getTicketById(args.id, context.user);
    },
    tickets: async (
      _parent: unknown,
      args: GetTicketsArgs,
      context: GraphQLContext
    ): Promise<TicketConnection> => {
      return getTickets(args, context.user);
    },
    dashboard: async (
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ): Promise<TicketDashboardResult> => {
      return getDashboard(context.user);
    },
  },
  Mutation: {
    register: async (
      _parent: unknown,
      args: RegisterInput
    ): Promise<AuthResponse> => {
      return register(args);
    },
    login: async (
      _parent: unknown,
      args: LoginInput
    ): Promise<AuthResponse> => {
      return login(args);
    },
    createTicket: async (
      _parent: unknown,
      args: CreateTicketInput,
      context: GraphQLContext
    ): Promise<TicketResult> => {
      return createTicket(args, context.user);
    },
    updateTicket: async (
      _parent: unknown,
      args: UpdateTicketInput,
      context: GraphQLContext
    ): Promise<TicketResult> => {
      return updateTicket(args, context.user);
    },
    deleteTicket: async (
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ): Promise<boolean> => {
      return deleteTicket(args.id, context.user);
    },
    assignTicket: async (
      _parent: unknown,
      args: { ticketId: string; agentId: string },
      context: GraphQLContext
    ): Promise<TicketResult> => {
      return assignTicket(args.ticketId, args.agentId, context.user);
    },
    addComment: async (
      _parent: unknown,
      args: { ticketId: string; body: string },
      context: GraphQLContext
    ): Promise<CommentResult> => {
      return addComment(args.ticketId, args.body, context.user);
    },
  },
};
