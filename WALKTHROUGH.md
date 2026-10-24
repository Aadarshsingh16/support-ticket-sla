# Support Ticket & SLA Tracker
## Take-Home Assignment — Written Walkthrough

### 1. Project Overview

The **Support Ticket & SLA Tracker** is a production-minded, full-stack application designed to manage customer support requests and track real-time Service Level Agreement (SLA) compliance. 

The system provides dual-target SLA tracking (First Response Target and Resolution Target) operating under custom business hours, deterministic calendar calculations, role-based access control, server-side data filtering, keyset cursor pagination, and an aggregated real-time metrics dashboard.

---

### 2. Technology Stack

- **Runtime**: [Bun](https://bun.sh/) (fast JavaScript/TypeScript runtime and test runner)
- **Language**: Strict TypeScript (`strict: true`, `noImplicitAny: true`, zero `any` usage)
- **API Layer**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) with a Schema-First design
- **Database & ORM**: PostgreSQL 16 managed via [Docker Compose](https://docs.docker.com/compose/) and queried using [Prisma 7](https://www.prisma.io/) with `@prisma/adapter-pg`
- **Frontend**: [React 19](https://react.dev/) + TypeScript bundled with [Vite](https://vitejs.dev/)
- **Styling**: Vanilla CSS design system with curated dark-mode tokens and responsive layouts
- **Testing**: Native `bun:test` runner executing unit, resolver, and real PostgreSQL integration tests

---

### 3. Architecture

The application adopts a layered, service-oriented architecture with strict separation between protocol handling, business logic, and database persistence:

```
┌─────────────────────────────────────────────────────────────┐
│                 React Frontend (Vite)                       │
│     - Auth context (JWT stored in localStorage)             │
│     - GraphQL HTTP Client (Authorization header injection)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP POST /graphql
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 GraphQL Yoga Server                         │
│     - Schema-first type definitions (schema.graphql)        │
│     - JWT authentication middleware (context creation)      │
│     - Thin Resolvers (argument parsing & error mapping)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Typed function invocations
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
│  - auth.service.ts      : Registration, login, password hash│
│  - ticket.service.ts    : Ticket CRUD, comments, filters,   │
│                           keyset cursor pagination          │
│  - sla.service.ts       : Calendar math, holidays, deadlines│
│  - dashboard.service.ts : Aggregated status & dynamic metrics│
└──────────────────────────────┬──────────────────────────────┘
                               │ Prisma Client 7 queries
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 PostgreSQL 16 Database                      │
│     - Relational tables: users, tickets, comments, holidays │
│     - Performance indexes on status, priority, and relations│
└─────────────────────────────────────────────────────────────┘
```

#### Core Service Modules:
- **`auth.service.ts`**: Handles user authentication, bcrypt hashing (10 salt rounds), and JWT issuance.
- **`ticket.service.ts`**: Manages ticket lifecycle states, agent assignments, comment threads, and keyset cursor generation.
- **`sla.service.ts`**: Encapsulates all calendar math, business-hour arithmetic, holiday skipping, and dynamic SLA state derivations.
- **`dashboard.service.ts`**: Aggregates role-scoped ticket status metrics and computes active SLA category distributions.

---

### 4. Key Engineering Decisions

#### A. Dynamic SLA Calculation
Instead of storing continuously fluctuating SLA statuses in PostgreSQL columns (which inevitably drift and require expensive background cron jobs to stay updated), SLA metrics are computed dynamically on demand from immutable audit timestamps (`createdAt`, `firstRespondedAt`, and `resolvedAt`). This ensures zero database write contention and 100% calculation accuracy.

#### B. Business-Hour SLA Arithmetic
All SLA calculations are pinned to the **`Asia/Kolkata`** timezone (`UTC +05:30`):
- **Working Hours**: Monday through Friday, 09:00 to 18:00 IST (9 business hours per day).
- **Non-Working Periods**: Saturdays, Sundays, and dates present in the `Holiday` table are completely excluded.
- **Out-of-Hours Submissions**: Tickets submitted after 18:00 IST or on non-working days automatically have their SLA clock start at 09:00 IST on the next working day.

#### C. SLA Priority Policy
| Priority | First Response Target | Resolution Target |
|---|---|---|
| **`URGENT`** | 1 business hour (60 min) | 4 business hours (240 min) |
| **`HIGH`** | 4 business hours (240 min) | 24 business hours (1,440 min) |
| **`MEDIUM`** | 8 business hours (480 min) | 48 business hours (2,880 min) |
| **`LOW`** | 24 business hours (1,440 min) | 72 business hours (4,320 min) |

#### D. SLA States & 75% Budget Rule
- **`ON_TRACK`**: $\le 75\%$ of the allotted SLA business budget has been consumed ($\ge 25\%$ remaining).
- **`AT_RISK`**: $> 75\%$ of the allotted SLA business budget has been consumed ($< 25\%$ remaining).
- **`BREACHED`**: The elapsed business time exceeds the deadline, or completion occurred after the deadline.

#### E. SLA Freezing & Lifecycle Permanence
- When an assigned `AGENT` posts the initial comment on a ticket, `firstRespondedAt` is stamped, permanently freezing the first-response SLA outcome.
- When a ticket moves to `RESOLVED` or `CLOSED`, `resolvedAt` is stamped, permanently freezing the resolution SLA outcome.
- Reopening a ticket (`IN_PROGRESS` or `OPEN`) clears `resolvedAt`, resuming active resolution tracking.

#### F. Server-Side Role-Based Authorization
- **`REPORTER`**: Restricted to reading and creating tickets where `reporterId = authenticatedUserId`.
- **`AGENT`**: Restricted to tickets where `assigneeId = authenticatedUserId`, with exclusive permissions to reassign tickets to other agents.
- Authorization boundaries are enforced strictly at the database query level, preventing unauthorized partition access.

#### G. Keyset Cursor Pagination
Pagination uses a Base64-encoded composite cursor `(createdAt, id)` with `(createdAt DESC, id DESC)` ordering. Keyset pagination avoids the performance degradation and duplicate/skipped item anomalies inherent in SQL `OFFSET` pagination under concurrent write workloads.

---

### 5. Main User Flows

#### Reporter Flow
1. **Register / Login**: Create a `REPORTER` account and receive a signed JWT token.
2. **Dashboard Overview**: View personal ticket counts (Open, In Progress, Resolved, Closed, At Risk, Breached).
3. **Create Ticket**: Submit a ticket with a title, description, and priority level.
4. **Track SLA & Comments**: Open ticket details to observe live response/resolution targets, remaining business minutes, and discussion history.

#### Agent Flow
1. **Login**: Authenticate as an `AGENT` to access the assigned ticket queue.
2. **First Response**: Post a response comment in the discussion thread; the backend records `firstRespondedAt` and freezes the first-response SLA.
3. **Manage Lifecycle**: Update status to `IN_PROGRESS` and subsequently `RESOLVED` (stamping `resolvedAt`).
4. **Reassign**: Reassign the ticket to another registered agent when escalation is required.

---

### 6. Dashboard & Filtering

The application provides multi-attribute filtering and aggregated metrics:
- **Status Metrics**: Aggregated directly via `prisma.ticket.groupBy` (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
- **Dynamic SLA Metrics**: Derived dynamically across authorized tickets (`AT_RISK`, `BREACHED`) with strict severity precedence to prevent double-counting.
- **Search & Filter Controls**: Combine case-insensitive substring search (`title` and `description`) with filters for `status`, `priority`, `assigneeId`, and `slaState`.
- **Keyset Cursor Traversal**: Client loads additional records smoothly using `hasNextPage` and `endCursor`.

---

### 7. Testing & Verification

The project includes an automated test suite executed via `bun:test` against local logic and a real PostgreSQL container:

```bash
bun run sanity
```

#### Verification Results:
- **TypeScript Strict Typecheck**: `tsc --noEmit` $\rightarrow$ **0 errors (Strict mode, zero `any`)**
- **Automated Tests**: **84 passing, 0 failing across 8 test suites (207 assertions)**
  - `tests/unit/validation.test.ts` (Input sanitization & validation)
  - `tests/unit/auth.test.ts` (Password hashing & JWT lifecycle)
  - `tests/unit/sla.service.test.ts` (Business calendar, holiday skipping, 75% boundary, freezing)
  - `tests/unit/ticket.pagination.test.ts` (Base64 keyset cursor encoding/decoding)
  - `tests/unit/ticket.sla-filter.test.ts` (SLA filtering & role partition guards)
  - `tests/unit/dashboard.service.test.ts` (Status aggregation & dynamic SLA counts)
  - `tests/unit/resolvers.test.ts` (GraphQL resolver guards & authorization)
  - `tests/integration/graphql.test.ts` (End-to-end integration against real PostgreSQL 16)
- **Frontend Production Build**: `vite build` $\rightarrow$ **Production bundle generated cleanly in ~300ms**

---

### 8. Setup & Quick Start

For detailed configuration instructions, environment options, and API examples, please refer to the complete [`README.md`](file:///c:/Users/adars/support-ticket-sla/README.md).

#### Essential Setup Commands:
```bash
# 1. Start PostgreSQL 16 database
docker compose up -d

# 2. Install dependencies & run migrations
bun install
bunx prisma migrate dev

# 3. Start backend (Port 4000) & frontend (Port 5173)
bun run dev
bun run dev:frontend

# 4. Run complete sanity suite (Typecheck + 84 Tests + Build)
bun run sanity
```

An [`.env.example`](file:///c:/Users/adars/support-ticket-sla/.env.example) file is included with pre-configured default values for local development.

---

### 9. Git Repository & Submission Details

- **GitHub Repository**: [https://github.com/Aadarshsingh16/support-ticket-sla](https://github.com/Aadarshsingh16/support-ticket-sla)
- **Feature Branch**: `feat/support-ticket-sla-tracker`
- **Base Branch**: `main` (anchored to initial schema commit `412e6ac`)
- **Pull Request**: Open for code review with a clean, 8-commit progression history.
- **Documentation**:
  - [`README.md`](file:///c:/Users/adars/support-ticket-sla/README.md): Comprehensive system documentation, architectural tradeoffs, and GraphQL query guide.
  - [`WALKTHROUGH.md`](file:///c:/Users/adars/support-ticket-sla/WALKTHROUGH.md): Concise implementation walkthrough and decision summary.

---

### 10. Conclusion

This implementation emphasizes production-minded full-stack engineering: a schema-first GraphQL API, robust service-layer separation, mathematically rigorous calendar-aware SLA derivation, server-enforced role partitioning, deterministic keyset cursor pagination, and automated test coverage.
