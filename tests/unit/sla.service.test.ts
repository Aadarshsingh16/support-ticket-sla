import { describe, it, expect } from "bun:test";
import {
  calculateBusinessDeadline,
  calculateRemainingBusinessMinutes,
  calculateTicketSLA,
  fromIST,
  toIST,
  SLAState,
  SLA_POLICIES,
} from "../../src/services/sla.service.ts";
import { TicketPriority, TicketStatus } from "../../generated/prisma/client.ts";

describe("Unit Tests: SLA Engine & Business Hours Calendar", () => {
  const emptyHolidays = new Set<string>();
  const testHolidays = new Set<string>(["2026-08-31"]); // Monday 2026-08-31 is Holiday

  describe("Business Time Arithmetic & Edge Cases", () => {
    // A & B: Normal weekday during business hours (Tuesday 10:00 IST + 4 hours -> Tue 14:00 IST)
    it("should calculate business deadline for normal weekday during business hours", () => {
      const start = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 0 }); // Tuesday
      const deadline = calculateBusinessDeadline(start, 4, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.year).toBe(2026);
      expect(ist.month).toBe(7);
      expect(ist.date).toBe(25);
      expect(ist.hours).toBe(14);
      expect(ist.minutes).toBe(0);
    });

    // C: Ticket created before business hours (Tuesday 07:00 IST + 2 hours -> starts at 09:00 -> Tue 11:00 IST)
    it("should start SLA clock at 09:00 IST if created before business hours", () => {
      const start = fromIST({ year: 2026, month: 7, date: 25, hours: 7, minutes: 0 }); // Tuesday 07:00
      const deadline = calculateBusinessDeadline(start, 2, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(25);
      expect(ist.hours).toBe(11);
      expect(ist.minutes).toBe(0);
    });

    // D: Ticket created after business hours (Tuesday 19:30 IST + 2 hours -> starts Wed 09:00 -> Wed 11:00 IST)
    it("should start SLA clock at 09:00 IST on next business day if created after business hours", () => {
      const start = fromIST({ year: 2026, month: 7, date: 25, hours: 19, minutes: 30 }); // Tuesday 19:30
      const deadline = calculateBusinessDeadline(start, 2, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(26); // Wednesday
      expect(ist.hours).toBe(11);
      expect(ist.minutes).toBe(0);
    });

    // E & F: Weekend creation (Saturday / Sunday -> starts Monday 09:00 IST)
    it("should advance Saturday ticket to Monday 09:00 IST before calculating deadline", () => {
      const saturday = fromIST({ year: 2026, month: 7, date: 29, hours: 14, minutes: 0 }); // Saturday
      const deadline = calculateBusinessDeadline(saturday, 3, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(31); // Monday
      expect(ist.hours).toBe(12);
      expect(ist.minutes).toBe(0);
    });

    it("should advance Sunday ticket to Monday 09:00 IST before calculating deadline", () => {
      const sunday = fromIST({ year: 2026, month: 7, date: 30, hours: 10, minutes: 0 }); // Sunday
      const deadline = calculateBusinessDeadline(sunday, 1, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(31); // Monday
      expect(ist.hours).toBe(10);
      expect(ist.minutes).toBe(0);
    });

    // G: Holiday creation (Monday holiday -> starts Tuesday 09:00 IST)
    it("should skip holiday dates and start SLA clock on next working day", () => {
      const holidayMonday = fromIST({ year: 2026, month: 7, date: 31, hours: 10, minutes: 0 });
      const deadline = calculateBusinessDeadline(holidayMonday, 2, testHolidays);
      const ist = toIST(deadline);

      expect(ist.month).toBe(8); // September
      expect(ist.date).toBe(1); // Tuesday Sep 1
      expect(ist.hours).toBe(11);
      expect(ist.minutes).toBe(0);
    });

    // H: Friday near closing crossing weekend (Friday 17:00 IST + 2 hours -> Monday 10:00 IST)
    it("should consume remaining Friday time and continue Monday morning", () => {
      const friday17 = fromIST({ year: 2026, month: 7, date: 28, hours: 17, minutes: 0 }); // Friday
      const deadline = calculateBusinessDeadline(friday17, 2, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(31); // Monday
      expect(ist.hours).toBe(10);
      expect(ist.minutes).toBe(0);
    });

    // I: Deadline crossing a holiday (Friday 17:00 IST + 2h with Monday as Holiday -> Tuesday 10:00 IST)
    it("should skip both weekend and Monday holiday when calculating deadline", () => {
      const friday17 = fromIST({ year: 2026, month: 7, date: 28, hours: 17, minutes: 0 }); // Friday
      const deadline = calculateBusinessDeadline(friday17, 2, testHolidays);
      const ist = toIST(deadline);

      expect(ist.month).toBe(8); // September
      expect(ist.date).toBe(1); // Tuesday Sep 1
      expect(ist.hours).toBe(10);
      expect(ist.minutes).toBe(0);
    });
  });

  describe("SLA Priority Policy Values", () => {
    it("URGENT policy should enforce 1h response and 4h resolution", () => {
      expect(SLA_POLICIES.URGENT.responseHours).toBe(1);
      expect(SLA_POLICIES.URGENT.resolutionHours).toBe(4);
    });

    it("HIGH policy should enforce 2h response and 8h resolution", () => {
      expect(SLA_POLICIES.HIGH.responseHours).toBe(2);
      expect(SLA_POLICIES.HIGH.resolutionHours).toBe(8);
    });

    it("MEDIUM policy should enforce 4h response and 16h resolution", () => {
      expect(SLA_POLICIES.MEDIUM.responseHours).toBe(4);
      expect(SLA_POLICIES.MEDIUM.resolutionHours).toBe(16);
    });

    it("LOW policy should enforce 8h response and 32h resolution", () => {
      expect(SLA_POLICIES.LOW.responseHours).toBe(8);
      expect(SLA_POLICIES.LOW.resolutionHours).toBe(32);
    });
  });

  describe("SLA State Evaluation (Deterministic Clocks)", () => {
    const createdAt = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 0 }); // Tue 10:00 IST (URGENT -> Response: Tue 11:00, Resolution: Tue 14:00)

    // N: First response before deadline -> ON_TRACK
    it("should evaluate responseState as ON_TRACK when first response occurred before deadline", async () => {
      const respondedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 30 }); // Tue 10:30 IST (before 11:00)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: respondedAt,
        resolvedAt: null,
        updatedAt: respondedAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, respondedAt);
      expect(sla.responseState).toBe(SLAState.ON_TRACK);
    });

    // O: First response after deadline -> BREACHED
    it("should evaluate responseState as BREACHED when first response occurred after deadline", async () => {
      const respondedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 11, minutes: 15 }); // Tue 11:15 IST (after 11:00)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: respondedAt,
        resolvedAt: null,
        updatedAt: respondedAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, respondedAt);
      expect(sla.responseState).toBe(SLAState.BREACHED);
    });

    // P: Unresolved ticket past response deadline without response -> BREACHED
    it("should evaluate responseState as BREACHED when clock exceeds deadline with no response", async () => {
      const now = fromIST({ year: 2026, month: 7, date: 25, hours: 11, minutes: 30 }); // Tue 11:30 IST
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: null,
        resolvedAt: null,
        updatedAt: createdAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, now);
      expect(sla.responseState).toBe(SLAState.BREACHED);
    });

    // Q: Unresolved ticket approaching response deadline (<= 20% remaining window) -> AT_RISK
    it("should evaluate responseState as AT_RISK when remaining business time <= 20% of SLA window", async () => {
      // URGENT SLA window = 60 min. 10 min left (16.6% <= 20%) -> Tue 10:50 IST
      const now = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 50 });
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: null,
        resolvedAt: null,
        updatedAt: createdAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, now);
      expect(sla.responseState).toBe(SLAState.AT_RISK);
    });

    // R: Resolution before deadline -> ON_TRACK
    it("should evaluate resolutionState as ON_TRACK when resolved before deadline", async () => {
      const resolvedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 13, minutes: 0 }); // Tue 13:00 IST (before 14:00)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.RESOLVED,
        firstRespondedAt: fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 15 }),
        resolvedAt,
        updatedAt: resolvedAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, resolvedAt);
      expect(sla.resolutionState).toBe(SLAState.ON_TRACK);
    });

    // S: Resolution after deadline -> BREACHED
    it("should evaluate resolutionState as BREACHED when resolved after deadline", async () => {
      const resolvedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 14, minutes: 30 }); // Tue 14:30 IST (after 14:00)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.RESOLVED,
        firstRespondedAt: fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 15 }),
        resolvedAt,
        updatedAt: resolvedAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, resolvedAt);
      expect(sla.resolutionState).toBe(SLAState.BREACHED);
    });

    // T: Closed ticket preserves historical SLA state
    it("should preserve historical resolution and response states when ticket is CLOSED", async () => {
      const resolvedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 12, minutes: 0 }); // On track
      const closedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 15, minutes: 0 });
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.CLOSED,
        firstRespondedAt: fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 20 }),
        resolvedAt,
        updatedAt: closedAt,
      };

      // Even if evaluated months later, state must remain ON_TRACK
      const futureDate = fromIST({ year: 2026, month: 11, date: 1, hours: 10, minutes: 0 });
      const sla = await calculateTicketSLA(ticket, emptyHolidays, futureDate);

      expect(sla.responseState).toBe(SLAState.ON_TRACK);
      expect(sla.resolutionState).toBe(SLAState.ON_TRACK);
    });
  });
});
