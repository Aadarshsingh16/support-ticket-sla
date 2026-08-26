/**
 * SLA Engine for Support Ticket & SLA Tracker
 *
 * Configuration Summary:
 * - Timezone: Asia/Kolkata (UTC +05:30) - Fixed offset, non-DST, deterministic worldwide.
 * - Business Hours: Monday to Friday, 09:00 to 18:00 IST (9 hours / day).
 * - Non-Business Days: Saturday, Sunday, and any dates registered in the Holiday table.
 *
 * SLA Policies (by Priority):
 * - URGENT: First Response: 1 business hour (60m),   Resolution: 4 business hours (240m)
 * - HIGH:   First Response: 4 business hours (240m),  Resolution: 24 business hours (1440m)
 * - MEDIUM: First Response: 8 business hours (480m),  Resolution: 48 business hours (2880m)
 * - LOW:    First Response: 24 business hours (1440m), Resolution: 72 business hours (4320m)
 *
 * SLA State Rules:
 * - ON_TRACK: 0% to 75% of SLA budget consumed (remaining business time >= 25% of SLA window).
 * - AT_RISK:  More than 75% of SLA budget consumed (remaining business time < 25% of SLA window).
 * - BREACHED: SLA deadline has passed without completion, or completed after deadline.
 *
 * SLA Freezing:
 * - First response SLA freezes permanently when `firstRespondedAt` is set.
 * - Resolution SLA freezes permanently when `resolvedAt` is set (or ticket is closed).
 * - Completed SLAs preserve their final state and completed remaining business minutes.
 *
 * Design Decision:
 * - SLA states, deadlines, and remaining minutes are dynamically derived from ticket timestamps,
 *   priority policies, and holidays rather than stored in PostgreSQL. This ensures real-time accuracy,
 *   eliminates sync drift, and supports full auditability.
 */

import { prisma } from "../lib/prisma.ts";
import {
  TicketPriority,
  TicketStatus,
  type Ticket,
} from "../../generated/prisma/client.ts";

export enum SLAState {
  ON_TRACK = "ON_TRACK",
  AT_RISK = "AT_RISK",
  BREACHED = "BREACHED",
}

export interface SLAInfo {
  responseDueAt: string;
  resolutionDueAt: string;
  responseState: SLAState;
  resolutionState: SLAState;
  responseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export interface SLAPolicy {
  responseHours: number;
  resolutionHours: number;
}

export const SLA_POLICIES: Record<TicketPriority, SLAPolicy> = {
  [TicketPriority.URGENT]: {
    responseHours: 1,
    resolutionHours: 4,
  },
  [TicketPriority.HIGH]: {
    responseHours: 4,
    resolutionHours: 24,
  },
  [TicketPriority.MEDIUM]: {
    responseHours: 8,
    resolutionHours: 48,
  },
  [TicketPriority.LOW]: {
    responseHours: 24,
    resolutionHours: 72,
  },
};

export const BUSINESS_HOURS = {
  timezone: "Asia/Kolkata",
  timezoneOffsetMinutes: 330, // UTC+5:30
  startHour: 9,
  startMinute: 0,
  endHour: 18,
  endMinute: 0,
};

// AT_RISK threshold: > 75% consumed (i.e. < 25% remaining)
export const CONSUMED_THRESHOLD_FOR_AT_RISK = 0.75;

const IST_OFFSET_MS = 330 * 60 * 1000;

interface ISTTime {
  year: number;
  month: number;
  date: number;
  dayOfWeek: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function toIST(date: Date): ISTTime {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth(),
    date: istDate.getUTCDate(),
    dayOfWeek: istDate.getUTCDay(),
    hours: istDate.getUTCHours(),
    minutes: istDate.getUTCMinutes(),
    seconds: istDate.getUTCSeconds(),
  };
}

export function fromIST(ist: {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds?: number;
}): Date {
  const utcMillis =
    Date.UTC(ist.year, ist.month, ist.date, ist.hours, ist.minutes, ist.seconds ?? 0) -
    IST_OFFSET_MS;
  return new Date(utcMillis);
}

export function toDateKey(year: number, month: number, date: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(date).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function isHoliday(
  year: number,
  month: number,
  date: number,
  holidays: Set<string>
): boolean {
  return holidays.has(toDateKey(year, month, date));
}

export function isBusinessDay(
  year: number,
  month: number,
  date: number,
  dayOfWeek: number,
  holidays: Set<string>
): boolean {
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false; // Sunday or Saturday
  }
  return !isHoliday(year, month, date, holidays);
}

export function calculateBusinessDeadline(
  startTime: Date,
  businessHours: number,
  holidays: Set<string>
): Date {
  let ist = toIST(startTime);

  // 1. Advance to valid business window if needed
  while (true) {
    if (!isBusinessDay(ist.year, ist.month, ist.date, ist.dayOfWeek, holidays)) {
      const nextDay = new Date(
        fromIST({ ...ist, hours: 9, minutes: 0 }).getTime() + 24 * 60 * 60 * 1000
      );
      ist = toIST(nextDay);
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      continue;
    }

    if (ist.hours < 9) {
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      break;
    }

    if (ist.hours >= 18) {
      const nextDay = new Date(
        fromIST({ ...ist, hours: 9, minutes: 0 }).getTime() + 24 * 60 * 60 * 1000
      );
      ist = toIST(nextDay);
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      continue;
    }

    break;
  }

  // 2. Consume business minutes
  let remainingMinutes = Math.round(businessHours * 60);

  while (remainingMinutes > 0) {
    const minutesUntilClose = (18 - ist.hours) * 60 - ist.minutes;

    if (remainingMinutes <= minutesUntilClose) {
      const totalMinutes = ist.hours * 60 + ist.minutes + remainingMinutes;
      ist.hours = Math.floor(totalMinutes / 60);
      ist.minutes = totalMinutes % 60;
      remainingMinutes = 0;
      break;
    }

    remainingMinutes -= minutesUntilClose;

    // Advance to 09:00 on the next business day
    let nextDate = fromIST({ ...ist, hours: 9, minutes: 0 });
    while (true) {
      nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
      ist = toIST(nextDate);
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      if (isBusinessDay(ist.year, ist.month, ist.date, ist.dayOfWeek, holidays)) {
        break;
      }
    }
  }

  return fromIST(ist);
}

export function calculateRemainingBusinessMinutes(
  fromTime: Date,
  toDeadline: Date,
  holidays: Set<string>
): number {
  if (fromTime >= toDeadline) {
    return 0;
  }

  let ist = toIST(fromTime);
  let accumulatedMinutes = 0;

  // Advance fromTime into business window if outside
  while (true) {
    if (!isBusinessDay(ist.year, ist.month, ist.date, ist.dayOfWeek, holidays)) {
      const nextDay = new Date(
        fromIST({ ...ist, hours: 9, minutes: 0 }).getTime() + 24 * 60 * 60 * 1000
      );
      ist = toIST(nextDay);
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      continue;
    }

    if (ist.hours < 9) {
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      break;
    }

    if (ist.hours >= 18) {
      const nextDay = new Date(
        fromIST({ ...ist, hours: 9, minutes: 0 }).getTime() + 24 * 60 * 60 * 1000
      );
      ist = toIST(nextDay);
      ist.hours = 9;
      ist.minutes = 0;
      ist.seconds = 0;
      continue;
    }

    break;
  }

  let currentPoint = fromIST(ist);
  if (currentPoint >= toDeadline) {
    return 0;
  }

  const deadlineIST = toIST(toDeadline);

  while (currentPoint < toDeadline) {
    if (!isBusinessDay(ist.year, ist.month, ist.date, ist.dayOfWeek, holidays)) {
      const nextDay = new Date(
        fromIST({ ...ist, hours: 9, minutes: 0 }).getTime() + 24 * 60 * 60 * 1000
      );
      ist = toIST(nextDay);
      ist.hours = 9;
      ist.minutes = 0;
      currentPoint = fromIST(ist);
      continue;
    }

    const isSameDayAsDeadline =
      ist.year === deadlineIST.year &&
      ist.month === deadlineIST.month &&
      ist.date === deadlineIST.date;

    const endHours = isSameDayAsDeadline ? deadlineIST.hours : 18;
    const endMinutes = isSameDayAsDeadline ? deadlineIST.minutes : 0;

    const availableMinutes = (endHours - ist.hours) * 60 + (endMinutes - ist.minutes);

    if (availableMinutes > 0) {
      accumulatedMinutes += availableMinutes;
    }

    if (isSameDayAsDeadline) {
      break;
    }

    const nextDay = new Date(
      fromIST({ ...ist, hours: 9, minutes: 0 }).getTime() + 24 * 60 * 60 * 1000
    );
    ist = toIST(nextDay);
    ist.hours = 9;
    ist.minutes = 0;
    currentPoint = fromIST(ist);
  }

  return accumulatedMinutes;
}

export async function fetchHolidaysSet(): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    select: { date: true },
  });

  const holidaySet = new Set<string>();
  for (const h of holidays) {
    const year = h.date.getUTCFullYear();
    const month = String(h.date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(h.date.getUTCDate()).padStart(2, "0");
    holidaySet.add(`${year}-${month}-${day}`);
  }
  return holidaySet;
}

export function evaluateResponse(
  ticket: Pick<Ticket, "firstRespondedAt" | "status" | "updatedAt">,
  responseDueAt: Date,
  totalResponseMinutes: number,
  holidays: Set<string>,
  now: Date
): { state: SLAState; remainingMinutes: number } {
  // 1. If response has already occurred, freeze response SLA
  if (ticket.firstRespondedAt !== null) {
    if (ticket.firstRespondedAt <= responseDueAt) {
      const remaining = calculateRemainingBusinessMinutes(
        ticket.firstRespondedAt,
        responseDueAt,
        holidays
      );
      return { state: SLAState.ON_TRACK, remainingMinutes: remaining };
    } else {
      return { state: SLAState.BREACHED, remainingMinutes: 0 };
    }
  }

  // 2. If ticket was closed without response
  if (ticket.status === TicketStatus.CLOSED) {
    if (ticket.updatedAt <= responseDueAt) {
      const remaining = calculateRemainingBusinessMinutes(
        ticket.updatedAt,
        responseDueAt,
        holidays
      );
      return { state: SLAState.ON_TRACK, remainingMinutes: remaining };
    } else {
      return { state: SLAState.BREACHED, remainingMinutes: 0 };
    }
  }

  // 3. Dynamic evaluation for active, un-responded ticket
  if (now >= responseDueAt) {
    return { state: SLAState.BREACHED, remainingMinutes: 0 };
  }

  const remaining = calculateRemainingBusinessMinutes(now, responseDueAt, holidays);
  const consumedRatio = (totalResponseMinutes - remaining) / totalResponseMinutes;

  const state =
    consumedRatio > CONSUMED_THRESHOLD_FOR_AT_RISK
      ? SLAState.AT_RISK
      : SLAState.ON_TRACK;

  return { state, remainingMinutes: Math.max(0, remaining) };
}

export function evaluateResolution(
  ticket: Pick<Ticket, "resolvedAt" | "status" | "updatedAt">,
  resolutionDueAt: Date,
  totalResolutionMinutes: number,
  holidays: Set<string>,
  now: Date
): { state: SLAState; remainingMinutes: number } {
  // 1. If resolution has already occurred, freeze resolution SLA
  if (ticket.resolvedAt !== null) {
    if (ticket.resolvedAt <= resolutionDueAt) {
      const remaining = calculateRemainingBusinessMinutes(
        ticket.resolvedAt,
        resolutionDueAt,
        holidays
      );
      return { state: SLAState.ON_TRACK, remainingMinutes: remaining };
    } else {
      return { state: SLAState.BREACHED, remainingMinutes: 0 };
    }
  }

  // 2. If ticket was closed
  if (ticket.status === TicketStatus.CLOSED) {
    if (ticket.updatedAt <= resolutionDueAt) {
      const remaining = calculateRemainingBusinessMinutes(
        ticket.updatedAt,
        resolutionDueAt,
        holidays
      );
      return { state: SLAState.ON_TRACK, remainingMinutes: remaining };
    } else {
      return { state: SLAState.BREACHED, remainingMinutes: 0 };
    }
  }

  // 3. Dynamic evaluation for active, unresolved ticket
  if (now >= resolutionDueAt) {
    return { state: SLAState.BREACHED, remainingMinutes: 0 };
  }

  const remaining = calculateRemainingBusinessMinutes(now, resolutionDueAt, holidays);
  const consumedRatio = (totalResolutionMinutes - remaining) / totalResolutionMinutes;

  const state =
    consumedRatio > CONSUMED_THRESHOLD_FOR_AT_RISK
      ? SLAState.AT_RISK
      : SLAState.ON_TRACK;

  return { state, remainingMinutes: Math.max(0, remaining) };
}

export function evaluateResponseState(
  ticket: Pick<Ticket, "firstRespondedAt" | "status" | "updatedAt">,
  responseDueAt: Date,
  totalResponseMinutes: number,
  holidays: Set<string>,
  now: Date
): SLAState {
  return evaluateResponse(ticket, responseDueAt, totalResponseMinutes, holidays, now)
    .state;
}

export function evaluateResolutionState(
  ticket: Pick<Ticket, "resolvedAt" | "status" | "updatedAt">,
  resolutionDueAt: Date,
  totalResolutionMinutes: number,
  holidays: Set<string>,
  now: Date
): SLAState {
  return evaluateResolution(ticket, resolutionDueAt, totalResolutionMinutes, holidays, now)
    .state;
}

export async function calculateTicketSLA(
  ticket: Pick<
    Ticket,
    "createdAt" | "priority" | "status" | "firstRespondedAt" | "resolvedAt" | "updatedAt"
  >,
  holidays?: Set<string>,
  currentTime?: Date
): Promise<SLAInfo> {
  const holidaySet = holidays ?? (await fetchHolidaysSet());
  const now = currentTime ?? new Date();

  const policy = SLA_POLICIES[ticket.priority];
  const totalResponseMinutes = policy.responseHours * 60;
  const totalResolutionMinutes = policy.resolutionHours * 60;

  const responseDueAt = calculateBusinessDeadline(
    ticket.createdAt,
    policy.responseHours,
    holidaySet
  );

  const resolutionDueAt = calculateBusinessDeadline(
    ticket.createdAt,
    policy.resolutionHours,
    holidaySet
  );

  const response = evaluateResponse(
    ticket,
    responseDueAt,
    totalResponseMinutes,
    holidaySet,
    now
  );

  const resolution = evaluateResolution(
    ticket,
    resolutionDueAt,
    totalResolutionMinutes,
    holidaySet,
    now
  );

  return {
    responseDueAt: responseDueAt.toISOString(),
    resolutionDueAt: resolutionDueAt.toISOString(),
    responseState: response.state,
    resolutionState: resolution.state,
    responseRemainingMinutes: response.remainingMinutes,
    resolutionRemainingMinutes: resolution.remainingMinutes,
  };
}
