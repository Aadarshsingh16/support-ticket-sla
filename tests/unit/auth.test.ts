import { describe, it, expect } from "bun:test";
import jwt from "jsonwebtoken";
import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  extractTokenFromHeader,
  JWT_SECRET,
} from "../../src/utils/auth.ts";
import { Role } from "../../generated/prisma/client.ts";

describe("Unit Tests: Authentication & Security", () => {
  describe("Password Hashing & Comparison", () => {
    it("should hash a password and not return plaintext", async () => {
      const plaintext = "SecureP@ssw0rd123";
      const hash = await hashPassword(plaintext);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(plaintext);
      expect(hash.startsWith("$2")).toBe(true); // bcrypt hash prefix
    });

    it("should successfully compare correct password with hash", async () => {
      const plaintext = "CorrectHorseBatteryStaple!";
      const hash = await hashPassword(plaintext);
      const isMatch = await comparePassword(plaintext, hash);

      expect(isMatch).toBe(true);
    });

    it("should fail comparison for incorrect password", async () => {
      const plaintext = "CorrectPassword123";
      const wrongPassword = "WrongPassword456";
      const hash = await hashPassword(plaintext);
      const isMatch = await comparePassword(wrongPassword, hash);

      expect(isMatch).toBe(false);
    });
  });

  describe("JWT Token Generation & Verification", () => {
    it("should generate a valid JWT containing userId and role", () => {
      const payload = {
        userId: "user-12345",
        email: "alice@example.com",
        role: Role.AGENT,
      };

      const token = generateToken(payload);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);

      const decoded = verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
      expect(decoded?.role).toBe(payload.role);
    });

    it("should fail verification for invalid/tampered token", () => {
      const invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature";
      const decoded = verifyToken(invalidToken);
      expect(decoded).toBeNull();
    });

    it("should fail verification for expired token", () => {
      const expiredToken = jwt.sign(
        { userId: "user-1", email: "user@example.com", role: Role.REPORTER },
        JWT_SECRET,
        { expiresIn: "-1s" }
      );

      const decoded = verifyToken(expiredToken);
      expect(decoded).toBeNull();
    });
  });

  describe("Authorization Header Extraction", () => {
    it("should extract token from valid Bearer authorization header", () => {
      const validToken = "my-secret-jwt-token-123";
      const header = `Bearer ${validToken}`;
      const extracted = extractTokenFromHeader(header);

      expect(extracted).toBe(validToken);
    });

    it("should extract token regardless of 'bearer' casing", () => {
      const validToken = "my-secret-jwt-token-123";
      const header = `bearer ${validToken}`;
      const extracted = extractTokenFromHeader(header);

      expect(extracted).toBe(validToken);
    });

    it("should return null for malformed or missing headers", () => {
      expect(extractTokenFromHeader(null)).toBeNull();
      expect(extractTokenFromHeader(undefined)).toBeNull();
      expect(extractTokenFromHeader("")).toBeNull();
      expect(extractTokenFromHeader("Basic 12345")).toBeNull();
      expect(extractTokenFromHeader("Bearer")).toBeNull();
      expect(extractTokenFromHeader("Bearer token extra parts")).toBeNull();
    });
  });
});
