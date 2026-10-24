import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Role, PrismaClient } from "../../generated/prisma/client.ts";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "1d";

export interface AuthTokenPayload {
  userId: string;
  role: Role;
  email?: string;
}

export interface GraphQLContext {
  user: AuthTokenPayload | null;
  prisma: PrismaClient;
}

export const JWT_SECRET = process.env["JWT_SECRET"] || "support_ticket_sla_dev_secret_key_2026";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error("JWT_SECRET environment variable is missing in production.");
    }
    return JWT_SECRET;
  }
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: AuthTokenPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
    if (decoded && typeof decoded === "object" && decoded["userId"] && decoded["role"]) {
      return {
        userId: decoded["userId"] as string,
        role: decoded["role"] as Role,
        email: typeof decoded["email"] === "string" ? decoded["email"] : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader?: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    return null;
  }

  return parts[1] || null;
}

export function extractAuthUser(authHeader?: string | null): AuthTokenPayload | null {
  const token = extractTokenFromHeader(authHeader);
  if (!token) {
    return null;
  }

  return verifyToken(token);
}
