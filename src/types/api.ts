export type Role = "REPORTER" | "AGENT";

export type TicketPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  author: User;
  body: string;
  createdAt: string;
}

export interface SLAInfo {
  responseDueAt: string;
  resolutionDueAt: string;
  responseState: SLAState;
  resolutionState: SLAState;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  reporterId: string;
  assigneeId?: string | null;
  reporter: User;
  assignee?: User | null;
  createdAt: string;
  updatedAt: string;
  firstRespondedAt?: string | null;
  resolvedAt?: string | null;
  comments: Comment[];
  sla: SLAInfo;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

export interface TicketConnection {
  nodes: Ticket[];
  pageInfo: PageInfo;
}

export interface AuthPayload {
  token: string;
  user: User;
}

export interface GraphQLErrorLocation {
  line: number;
  column: number;
}

export interface GraphQLErrorExtension {
  code?: string;
  field?: string;
  [key: string]: unknown;
}

export interface GraphQLErrorItem {
  message: string;
  locations?: GraphQLErrorLocation[];
  path?: string[];
  extensions?: GraphQLErrorExtension;
}

export interface GraphQLResponse<T> {
  data?: T | null;
  errors?: GraphQLErrorItem[];
}
