import {
  register,
  login,
  getMe,
  type RegisterInput,
  type LoginInput,
  type AuthResponse,
  type SafeUser,
} from "../../services/auth.service.ts";
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
  },
};
