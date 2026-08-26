import { describe, it, expect } from "bun:test";
import { register } from "../../src/services/auth.service.ts";
import {
  createTicket,
  addComment,
} from "../../src/services/ticket.service.ts";
import { Role, TicketPriority } from "../../generated/prisma/client.ts";

describe("Unit Tests: Input Validation", () => {
  describe("Registration Input Validation", () => {
    it("should reject empty name", async () => {
      expect(
        register({ name: "", email: "user@example.com", password: "Password123!" })
      ).rejects.toThrow("Name is required and cannot be blank.");
    });

    it("should reject whitespace-only name", async () => {
      expect(
        register({ name: "   ", email: "user@example.com", password: "Password123!" })
      ).rejects.toThrow("Name is required and cannot be blank.");
    });

    it("should reject invalid email format", async () => {
      expect(
        register({ name: "Alice", email: "not-an-email", password: "Password123!" })
      ).rejects.toThrow("Please provide a valid email address.");
    });

    it("should reject password shorter than 8 characters", async () => {
      expect(
        register({ name: "Alice", email: "alice@example.com", password: "short" })
      ).rejects.toThrow("Password must be at least 8 characters long.");
    });
  });

  describe("Ticket Creation Input Validation", () => {
    const fakeAuthUser = {
      userId: "test-user-id",
      email: "reporter@example.com",
      role: Role.REPORTER,
    };

    it("should reject empty ticket title", async () => {
      expect(
        createTicket(
          { title: "", description: "Valid description", priority: TicketPriority.HIGH },
          fakeAuthUser
        )
      ).rejects.toThrow("Title is required and cannot be empty.");
    });

    it("should reject whitespace-only ticket title", async () => {
      expect(
        createTicket(
          { title: "   ", description: "Valid description", priority: TicketPriority.HIGH },
          fakeAuthUser
        )
      ).rejects.toThrow("Title is required and cannot be empty.");
    });

    it("should reject empty ticket description", async () => {
      expect(
        createTicket(
          { title: "Valid Title", description: "", priority: TicketPriority.HIGH },
          fakeAuthUser
        )
      ).rejects.toThrow("Description is required and cannot be empty.");
    });

    it("should reject whitespace-only ticket description", async () => {
      expect(
        createTicket(
          { title: "Valid Title", description: "   ", priority: TicketPriority.HIGH },
          fakeAuthUser
        )
      ).rejects.toThrow("Description is required and cannot be empty.");
    });
  });

  describe("Comment Input Validation", () => {
    const fakeAuthUser = {
      userId: "test-user-id",
      email: "reporter@example.com",
      role: Role.REPORTER,
    };

    it("should reject empty comment body", async () => {
      expect(
        addComment("ticket-1", "", fakeAuthUser)
      ).rejects.toThrow("Comment body is required and cannot be empty.");
    });

    it("should reject whitespace-only comment body", async () => {
      expect(
        addComment("ticket-1", "   ", fakeAuthUser)
      ).rejects.toThrow("Comment body is required and cannot be empty.");
    });
  });
});
