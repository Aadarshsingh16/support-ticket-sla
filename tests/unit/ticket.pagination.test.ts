import { describe, it, expect } from "bun:test";
import {
  encodeCursor,
  decodeCursor,
  getTickets,
} from "../../src/services/ticket.service.ts";
import { Role } from "../../generated/prisma/client.ts";

describe("Unit Tests: Cursor Pagination & Keyset Sequencing", () => {
  describe("Cursor Encoding & Decoding", () => {
    it("should encode a ticket timestamp and ID into base64", () => {
      const createdAt = new Date("2026-08-25T14:30:00.000Z");
      const id = "ticket-cuid-12345";

      const cursor = encodeCursor({ createdAt, id });
      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(10);
    });

    it("should accurately decode cursor back to original timestamp and ID", () => {
      const createdAt = new Date("2026-08-25T14:30:00.000Z");
      const id = "ticket-cuid-12345";

      const cursor = encodeCursor({ createdAt, id });
      const decoded = decodeCursor(cursor);

      expect(decoded.id).toBe(id);
      expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
    });

    it("should reject non-base64 or malformed cursor payloads with BAD_USER_INPUT", () => {
      expect(() => decodeCursor("not-a-base64-string!@#$")).toThrow("Invalid cursor provided.");
      expect(() => decodeCursor(Buffer.from("plain string").toString("base64"))).toThrow("Invalid cursor provided.");
      expect(() => decodeCursor(Buffer.from(JSON.stringify({ onlyId: "123" })).toString("base64"))).toThrow("Invalid cursor provided.");
    });
  });

  describe("Pagination Page Size Validation", () => {
    const fakeAuthUser = {
      userId: "test-reporter-id",
      email: "reporter@example.com",
      role: Role.REPORTER,
    };

    it("should reject first <= 0 with BAD_USER_INPUT", () => {
      expect(
        getTickets({ first: 0 }, fakeAuthUser)
      ).rejects.toThrow("'first' must be a positive integer between 1 and 50.");

      expect(
        getTickets({ first: -5 }, fakeAuthUser)
      ).rejects.toThrow("'first' must be a positive integer between 1 and 50.");
    });

    it("should reject first > 50 with BAD_USER_INPUT", () => {
      expect(
        getTickets({ first: 51 }, fakeAuthUser)
      ).rejects.toThrow("'first' must be a positive integer between 1 and 50.");

      expect(
        getTickets({ first: 100 }, fakeAuthUser)
      ).rejects.toThrow("'first' must be a positive integer between 1 and 50.");
    });
  });
});
