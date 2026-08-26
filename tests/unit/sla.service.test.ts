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
    // 1 & 2: Normal weekday during business hours (Tuesday 10:00 IST + 4 hours -> Tue 14:00 IST)
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

    // 3: Ticket created before business hours (Tuesday 07:00 IST + 4 hours -> starts at 09:00 -> Tue 13:00 IST)
    it("should start SLA clock at 09:00 IST if created before business hours", () => {
      const start = fromIST({ year: 2026, month: 7, date: 25, hours: 7, minutes: 0 }); // Tuesday 07:00
      const deadline = calculateBusinessDeadline(start, 4, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(25);
      expect(ist.hours).toBe(13);
      expect(ist.minutes).toBe(0);
    });

    // 4: Ticket created after business hours (Tuesday 19:30 IST + 4 hours -> starts Wed 09:00 -> Wed 13:00 IST)
    it("should start SLA clock at 09:00 IST on next business day if created after business hours", () => {
      const start = fromIST({ year: 2026, month: 7, date: 25, hours: 19, minutes: 30 }); // Tuesday 19:30
      const deadline = calculateBusinessDeadline(start, 4, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(26); // Wednesday
      expect(ist.hours).toBe(13);
      expect(ist.minutes).toBe(0);
    });

    // 5 & 6: Weekend creation (Saturday / Sunday -> starts Monday 09:00 IST)
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

    // 7: Holiday creation (Monday holiday -> starts Tuesday 09:00 IST)
    it("should skip holiday dates and start SLA clock on next working day", () => {
      const holidayMonday = fromIST({ year: 2026, month: 7, date: 31, hours: 10, minutes: 0 });
      const deadline = calculateBusinessDeadline(holidayMonday, 2, testHolidays);
      const ist = toIST(deadline);

      expect(ist.month).toBe(8); // September
      expect(ist.date).toBe(1); // Tuesday Sep 1
      expect(ist.hours).toBe(11);
      expect(ist.minutes).toBe(0);
    });

    // 8: Friday near closing crossing weekend (Friday 17:00 IST + 2 hours -> Monday 10:00 IST)
    it("should consume remaining Friday time and continue Monday morning", () => {
      const friday17 = fromIST({ year: 2026, month: 7, date: 28, hours: 17, minutes: 0 }); // Friday
      const deadline = calculateBusinessDeadline(friday17, 2, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(31); // Monday
      expect(ist.hours).toBe(10);
      expect(ist.minutes).toBe(0);
    });

    // 9: Deadline crossing a holiday (Friday 17:00 IST + 2h with Monday as Holiday -> Tuesday 10:00 IST)
    it("should skip both weekend and Monday holiday when calculating deadline", () => {
      const friday17 = fromIST({ year: 2026, month: 7, date: 28, hours: 17, minutes: 0 }); // Friday
      const deadline = calculateBusinessDeadline(friday17, 2, testHolidays);
      const ist = toIST(deadline);

      expect(ist.month).toBe(8); // September
      expect(ist.date).toBe(1); // Tuesday Sep 1
      expect(ist.hours).toBe(10);
      expect(ist.minutes).toBe(0);
    });

    // 10: Multiple business-day SLA (HIGH resolution: 24 business hours = 2 days (18h) + 6h)
    it("should calculate multiple business-day resolution deadlines accurately", () => {
      // Tuesday 09:00 IST + 24h:
      // Day 1 (Tue): 9h (consumed 9h, 15h left)
      // Day 2 (Wed): 9h (consumed 18h, 6h left)
      // Day 3 (Thu): 6h (09:00 + 6h = 15:00 IST)
      const tue09 = fromIST({ year: 2026, month: 7, date: 25, hours: 9, minutes: 0 }); // Tuesday
      const deadline = calculateBusinessDeadline(tue09, 24, emptyHolidays);
      const ist = toIST(deadline);

      expect(ist.date).toBe(27); // Thursday
      expect(ist.hours).toBe(15);
      expect(ist.minutes).toBe(0);
    });
  });

  describe("SLA Priority Policy Values (BurdenOff Specification)", () => {
    it("URGENT policy should enforce 1h response and 4h resolution", () => {
      expect(SLA_POLICIES.URGENT.responseHours).toBe(1);
      expect(SLA_POLICIES.URGENT.resolutionHours).toBe(4);
    });

    it("HIGH policy should enforce 4h response and 24h resolution", () => {
      expect(SLA_POLICIES.HIGH.responseHours).toBe(4);
      expect(SLA_POLICIES.HIGH.resolutionHours).toBe(24);
    });

    it("MEDIUM policy should enforce 8h response and 48h resolution", () => {
      expect(SLA_POLICIES.MEDIUM.responseHours).toBe(8);
      expect(SLA_POLICIES.MEDIUM.resolutionHours).toBe(48);
    });

    it("LOW policy should enforce 24h response and 72h resolution", () => {
      expect(SLA_POLICIES.LOW.responseHours).toBe(24);
      expect(SLA_POLICIES.LOW.resolutionHours).toBe(72);
    });
  });

  describe("SLA State Rules & 75% Budget Boundary", () => {
    // URGENT SLA: 60 minutes response budget. Created at Tue 10:00 IST -> Deadline Tue 11:00 IST.
    const createdAt = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 0 });

    // 0% - 75% consumed -> ON_TRACK (e.g. 70% consumed = 42 min consumed, 18 min remaining -> Tue 10:42 IST)
    it("should evaluate state as ON_TRACK when <= 75% of SLA budget is consumed", async () => {
      const now = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 40 }); // 40m consumed (66.7% <= 75%)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: null,
        resolvedAt: null,
        updatedAt: createdAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, now);
      expect(sla.responseState).toBe(SLAState.ON_TRACK);
      expect(sla.responseRemainingMinutes).toBe(20);
    });

    // Exactly 75% consumed -> ON_TRACK (45m consumed, 15m remaining -> Tue 10:45 IST)
    it("should evaluate state as ON_TRACK at exactly 75% budget consumed boundary", async () => {
      const now = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 45 }); // 45m consumed (exactly 75%)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: null,
        resolvedAt: null,
        updatedAt: createdAt,
      };

      const sla = await calculateTicketSLA(ticket, emptyHolidays, now);
      expect(sla.responseState).toBe(SLAState.ON_TRACK);
      expect(sla.responseRemainingMinutes).toBe(15);
    });

    // More than 75% consumed -> AT_RISK (e.g. 46m consumed / 76.7% -> Tue 10:46 IST)
    it("should evaluate state as AT_RISK when > 75% of SLA budget is consumed", async () => {
      const now = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 48 }); // 48m consumed (80% > 75%)
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
      expect(sla.responseRemainingMinutes).toBe(12);
    });

    // Clock exceeds deadline -> BREACHED (Tue 11:05 IST)
    it("should evaluate state as BREACHED when clock passes deadline", async () => {
      const now = fromIST({ year: 2026, month: 7, date: 25, hours: 11, minutes: 5 }); // 5m past deadline
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
      expect(sla.responseRemainingMinutes).toBe(0); // never negative
    });
  });

  describe("SLA Freezing & Lifecycle Permanence", () => {
    const createdAt = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 0 }); // URGENT: Resp due 11:00, Res due 14:00

    it("should freeze response SLA when first response is recorded before deadline", async () => {
      const respondedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 30 }); // Tue 10:30 (30m remaining)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: respondedAt,
        resolvedAt: null,
        updatedAt: respondedAt,
      };

      // Check evaluated days later: must remain ON_TRACK and preserve remaining minutes at completion
      const futureNow = fromIST({ year: 2026, month: 7, date: 28, hours: 12, minutes: 0 });
      const sla = await calculateTicketSLA(ticket, emptyHolidays, futureNow);

      expect(sla.responseState).toBe(SLAState.ON_TRACK);
      expect(sla.responseRemainingMinutes).toBe(30);
    });

    it("should freeze response SLA as BREACHED when response was recorded after deadline", async () => {
      const respondedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 11, minutes: 15 }); // Tue 11:15 (past 11:00)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.OPEN,
        firstRespondedAt: respondedAt,
        resolvedAt: null,
        updatedAt: respondedAt,
      };

      const futureNow = fromIST({ year: 2026, month: 7, date: 28, hours: 12, minutes: 0 });
      const sla = await calculateTicketSLA(ticket, emptyHolidays, futureNow);

      expect(sla.responseState).toBe(SLAState.BREACHED);
      expect(sla.responseRemainingMinutes).toBe(0);
    });

    it("should freeze resolution SLA when ticket is resolved before deadline", async () => {
      const resolvedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 13, minutes: 0 }); // Tue 13:00 (60m remaining before 14:00)
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.RESOLVED,
        firstRespondedAt: fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 15 }),
        resolvedAt,
        updatedAt: resolvedAt,
      };

      const futureNow = fromIST({ year: 2026, month: 8, date: 5, hours: 12, minutes: 0 });
      const sla = await calculateTicketSLA(ticket, emptyHolidays, futureNow);

      expect(sla.resolutionState).toBe(SLAState.ON_TRACK);
      expect(sla.resolutionRemainingMinutes).toBe(60);
    });

    it("should preserve historical resolution and response states when ticket is CLOSED", async () => {
      const resolvedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 12, minutes: 0 });
      const closedAt = fromIST({ year: 2026, month: 7, date: 25, hours: 15, minutes: 0 });
      const ticket = {
        createdAt,
        priority: TicketPriority.URGENT,
        status: TicketStatus.CLOSED,
        firstRespondedAt: fromIST({ year: 2026, month: 7, date: 25, hours: 10, minutes: 20 }),
        resolvedAt,
        updatedAt: closedAt,
      };

      const futureDate = fromIST({ year: 2026, month: 11, date: 1, hours: 10, minutes: 0 });
      const sla = await calculateTicketSLA(ticket, emptyHolidays, futureDate);

      expect(sla.responseState).toBe(SLAState.ON_TRACK);
      expect(sla.resolutionState).toBe(SLAState.ON_TRACK);
      expect(sla.responseRemainingMinutes).toBe(40);
      expect(sla.resolutionRemainingMinutes).toBe(120);
    });
  });
});
