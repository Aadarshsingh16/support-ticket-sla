import { GraphQLError } from "graphql";
import { prisma } from "../lib/prisma.ts";
import { Role } from "../../generated/prisma/client.ts";
import {
  validateRegistrationInput,
  validateLoginInput,
} from "../utils/validation.ts";
import {
  hashPassword,
  comparePassword,
  generateToken,
} from "../utils/auth.ts";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: SafeUser;
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const { normalizedName, normalizedEmail } = validateRegistrationInput(
    input.name,
    input.email,
    input.password
  );

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new GraphQLError("A user with this email address already exists.", {
      extensions: { code: "BAD_USER_INPUT", field: "email" },
    });
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role: Role.REPORTER,
    },
  });

  const token = generateToken({
    userId: user.id,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const { normalizedEmail } = validateLoginInput(input.email, input.password);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new GraphQLError("Invalid email or password.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  const isPasswordValid = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new GraphQLError("Invalid email or password.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  const token = generateToken({
    userId: user.id,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  };
}

export async function getMe(userId: string): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
