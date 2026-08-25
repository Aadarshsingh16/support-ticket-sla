# Support Ticket & SLA Tracker

BurdenOff Consultancy Services Product Engineering Intern Assignment.

## Tech Stack
- **Runtime**: Bun 1.4.0
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL 16 (via Docker) with Prisma 7.10.0 (`@prisma/adapter-pg`)
- **API**: GraphQL Yoga + GraphQL-JS

---

## SLA Engine Design & Policy

### 1. Timezone
- **Timezone**: `Asia/Kolkata` (UTC +05:30)
- All business-hour calculations use deterministic `Asia/Kolkata` calendar arithmetic regardless of where the backend host or client runs.

### 2. Business Hours & Calendar Rules
- **Working Days**: Monday through Friday
- **Working Hours**: 09:00 to 18:00 IST (9 business hours per day)
- **Non-Business Days**:
  - Saturday & Sunday (weekends)
  - Dates registered in the `Holiday` table
- **Outside Hours Ingestion**: If a ticket is created outside business hours, over a weekend, or on a holiday, the SLA timer begins at 09:00 IST on the immediately following business day.

### 3. Priority SLA Policies
| Priority | First Response SLA | Resolution SLA |
|---|---|---|
| **URGENT** | 1 business hour (60 min) | 4 business hours (240 min) |
| **HIGH** | 2 business hours (120 min) | 8 business hours (480 min) |
| **MEDIUM** | 4 business hours (240 min) | 16 business hours (960 min) |
| **LOW** | 8 business hours (480 min) | 32 business hours (1920 min) |

### 4. SLA States & `AT_RISK` Definition
- `ON_TRACK`: The target is met, or the remaining business time is > 20% of the total SLA window.
- `AT_RISK`: The target is not yet completed and remaining business time is $\le 20\%$ ($\le 0.20$) of the total SLA window.
- `BREACHED`: The current time has exceeded the deadline without completion, or the completion timestamp exceeded the deadline.

### 5. Why SLA Data is Calculated Rather Than Stored
- **Dynamic Accuracy**: SLA state changes continuously with elapsed time without requiring database write polling or cron writes.
- **Auditability & Drift Elimination**: Deadlines are deterministically derived from immutable ticket lifecycle events (`createdAt`, `firstRespondedAt`, `resolvedAt`) and registered holidays.
- **Zero Redundancy**: Eliminates data staleness and synchronization bugs across distributed workers or server restarts.

---

## Running the Project

```bash
# Install dependencies
bun install

# Run database migrations
bunx --bun prisma migrate dev

# Run GraphQL API server
bun run dev

# Run TypeScript check
bun run typecheck
```
