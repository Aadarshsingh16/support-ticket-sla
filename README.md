# Support Ticket & SLA Tracker

> **BurdenOff Consultancy Services Product Engineering Intern — Full Stack Take-Home Assignment**

A production-grade, full-stack Support Ticket & SLA Tracking platform built with **Bun**, **TypeScript**, **GraphQL Yoga**, **Prisma 7**, **PostgreSQL 16**, and **React**.

---

## 1. Overview

The **Support Ticket & SLA Tracker** enables organizations to manage support tickets with automated, deterministic SLA (Service Level Agreement) compliance tracking. The application dynamically evaluates first-response and resolution deadlines across business hours, skipping weekends and official holidays.

Key capabilities:
- **Role-Scoped Access Control**: Granular permissions for `REPORTER` (submitting and viewing own tickets) and `AGENT` (handling assigned tickets and reassignments).
- **Deterministic SLA Engine**: Dynamic calendar arithmetic in `Asia/Kolkata` calculating deadlines and compliance states (`ON_TRACK`, `AT_RISK`, `BREACHED`).
- **Keyset Cursor Pagination & Filtering**: Scalable cursor-based pagination with substring search, status filters, priority filters, and assignee constraints.
- **Real-Time Discussion Thread**: Ticket comments with automatic first-response timestamp tracking (`firstRespondedAt`).
- **Modern Responsive Frontend**: Dark-themed React application with real-time feedback, badge indicators, and zero external UI bloat.

---

## 2. Tech Stack

- **Runtime & Package Manager**: [Bun](https://bun.com) (v1.4.0)
- **Language**: TypeScript (Strict Mode, 0 `any`)
- **Backend API**: [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) + `graphql-js`
- **Database & ORM**: PostgreSQL 16 (Docker) with [Prisma 7.10.0](https://www.prisma.io) and official `@prisma/adapter-pg` driver adapter
- **Authentication**: JWT (`jsonwebtoken`) with `bcryptjs` password hashing (10 salt rounds)
- **Frontend**: [React 19](https://react.dev) + [Vite](https://vitejs.dev) + Vanilla CSS (Design Tokens & Inter Typography)
- **Testing**: Native `bun:test` runner (58 tests covering unit, resolver, calendar math, and PostgreSQL integration)

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────┐
│              React 19 + TypeScript (Vite)              │
│        (Navbar, Dashboard, TicketDetails, Forms)        │
└────────────────────────────┬────────────────────────────┘
                             │  HTTP POST /graphql (Bearer JWT)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                   GraphQL Yoga Server                   │
│             (Port 4000 • schema.graphql)                │
└────────────────────────────┬────────────────────────────┘
                             │  Thin Resolvers + Context
                             ▼
┌─────────────────────────────────────────────────────────┐
│                      Service Layer                      │
│   auth.service.ts   •   ticket.service.ts   •   sla.service.ts   │
└────────────────────────────┬────────────────────────────┘
                             │  Prisma 7 Client (@prisma/adapter-pg)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 PostgreSQL 16 (Docker)                  │
│       (Tables: users, tickets, comments, holidays)       │
└─────────────────────────────────────────────────────────┘
```

### Where Business Logic Lives:
- **Thin Resolvers** (`src/graphql/resolvers/index.ts`): Resolvers only unpack arguments, inject authentication context, and delegate to services.
- **Service Layer** (`src/services/`): All validation, access control, state transitions, and business logic reside in isolated services.
- **SLA Engine** (`src/services/sla.service.ts`): Business-hour calendar calculations, holiday lookups, and state determinations are dynamically computed without polluting database tables.

---

## 4. Prerequisites

- **Bun**: v1.4.0 or higher ([Install Bun](https://bun.sh))
- **Docker Desktop**: For running PostgreSQL 16 container
- **Git**: For source version control

---

## 5. Setup & Installation

### Step 1: Clone and Install Dependencies
```bash
git clone <repository-url>
cd support-ticket-sla

# Install dependencies via Bun
bun install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `.env` contains:
```ini
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/support_ticket?schema=public"
JWT_SECRET="your-secure-jwt-secret-key-here"
PORT=4000
NODE_ENV=development
```

### Step 3: Start PostgreSQL with Docker
```bash
docker compose up -d
```

### Step 4: Run Prisma Migrations & Generate Client
```bash
# Run migrations against PostgreSQL
bunx prisma migrate dev

# Generate Prisma Client (or use npm script)
bun run gendb
```

---

## 6. Running the Application

### Start GraphQL Backend Server (Port 4000):
```bash
bun run dev
```
*GraphQL Yoga API will be live at `http://localhost:4000/graphql`.*

### Start React Frontend Dev Server (Port 5173):
```bash
bun run dev:frontend
```
*Frontend application will be accessible at `http://localhost:5173/`.*

### Build Frontend for Production:
```bash
bun run build
```

---

## 7. Testing & Quality Verification

Run the automated test suite powered by `bun:test`:

```bash
# Run all tests (Unit + PostgreSQL Integration)
bun test

# Run unit tests only
bun run test:unit

# Run PostgreSQL integration tests only
bun run test:integration

# Run strict TypeScript typecheck
bun run typecheck

# Run complete sanity check (Typecheck + Test Suite + Build)
bun run sanity
```

**Test Verification Status**:
- **58 tests passing** (0 failures)
- **122 assertions**
- Strict TypeScript check: **0 errors**, **0 `any`**

---

## 8. GraphQL API Reference

### Authentication Queries & Mutations
```graphql
# Register a new user (defaults to REPORTER role)
mutation Register($name: String!, $email: String!, $password: String!) {
  register(name: $name, email: $email, password: $password) {
    token
    user { id name email role }
  }
}

# Login and receive JWT
mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    token
    user { id name email role }
  }
}

# Current authenticated user profile
query Me {
  me { id name email role }
}
```

### Ticket Operations & Cursor Pagination
```graphql
# Create ticket
mutation CreateTicket($title: String!, $description: String!, $priority: TicketPriority!) {
  createTicket(title: $title, description: $description, priority: $priority) {
    id title priority status createdAt
    sla { responseDueAt resolutionDueAt responseState resolutionState }
  }
}

# Fetch single ticket by ID
query GetTicket($id: ID!) {
  ticket(id: $id) {
    id title description priority status
    reporter { id name email }
    assignee { id name email }
    comments { id body createdAt author { name role } }
    sla { responseDueAt resolutionDueAt responseState resolutionState }
  }
}

# Query tickets with cursor-based pagination and filters (status, priority, assignee, search, slaState)
query GetTickets(
  $first: Int
  $after: String
  $search: String
  $status: TicketStatus
  $priority: TicketPriority
  $assigneeId: ID
  $slaState: SLAState
) {
  tickets(
    first: $first
    after: $after
    search: $search
    status: $status
    priority: $priority
    assigneeId: $assigneeId
    slaState: $slaState
  ) {
    nodes {
      id title priority status createdAt
      reporter { name }
      assignee { name }
      sla {
        responseDueAt
        resolutionDueAt
        responseState
        resolutionState
        responseRemainingMinutes
        resolutionRemainingMinutes
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}

# Update ticket attributes or lifecycle status
mutation UpdateTicket($id: ID!, $status: TicketStatus, $priority: TicketPriority) {
  updateTicket(id: $id, status: $status, priority: $priority) {
    id status priority resolvedAt
  }
}

# Assign ticket to an Agent (AGENT role only)
mutation AssignTicket($ticketId: ID!, $agentId: ID!) {
  assignTicket(ticketId: $ticketId, agentId: $agentId) {
    id assigneeId assignee { name role }
  }
}

# Add comment (tracks firstRespondedAt if first AGENT comment)
mutation AddComment($ticketId: ID!, $body: String!) {
  addComment(ticketId: $ticketId, body: $body) {
    id body createdAt author { name role }
  }
}
# Fetch aggregated dashboard metrics (role-scoped, dynamic SLA counts)
query GetDashboard {
  dashboard {
    openTickets
    inProgressTickets
    resolvedTickets
    closedTickets
    atRiskTickets
    breachedTickets
  }
}
```

---

## 9. SLA Engine & Business Calendar Rules

### Working Schedule
- **Timezone**: `Asia/Kolkata` (`UTC +05:30`) — calculations use deterministic calendar math.
- **Working Days**: Monday through Friday.
- **Working Hours**: 09:00 to 18:00 IST (9 business hours per day).
- **Non-Business Days**: Saturday, Sunday, and dates in the `Holiday` table.
- **Outside Hours Ingestion**: If a ticket is logged outside business hours, on weekends, or on holidays, the SLA clock begins at 09:00 IST on the immediately following business day.

### Implemented Priority SLA Policies (BurdenOff Specification)
| Priority | First Response Target | Resolution Target |
|---|---|---|
| **URGENT** | 1 business hour (60 min) | 4 business hours (240 min) |
| **HIGH** | 4 business hours (240 min) | 24 business hours (1440 min) |
| **MEDIUM** | 8 business hours (480 min) | 48 business hours (2880 min) |
| **LOW** | 24 business hours (1440 min) | 72 business hours (4320 min) |

### SLA State Definitions & 75% Boundary Rule
- **`ON_TRACK`**: 0% to 75% of SLA budget consumed (remaining business time $\ge 25\%$ of total SLA window). Target completed within deadline.
- **`AT_RISK`**: More than 75% of SLA budget consumed (remaining business time $< 25\%$ of total SLA window) while ticket is active.
- **`BREACHED`**: SLA deadline has passed without completion, or completion occurred after the deadline.

### SLA Freezing & Remaining Business Minutes
- **First Response Freezing**: When `firstRespondedAt` occurs (via first agent comment), the first-response SLA permanently freezes. Later time passage will never change an on-track response into breached.
- **Resolution Freezing**: When `resolvedAt` occurs (or ticket is closed), the resolution SLA permanently freezes.
- **Remaining Business Time**: The GraphQL `SLAInfo` type exposes `responseRemainingMinutes` and `resolutionRemainingMinutes`. For active SLAs, it returns remaining business minutes (returns 0 if past deadline, never negative). Completed SLAs return the remaining business minutes at the time of completion.

---

## 10. Authorization & Security Model

- **Base Visibility Scope**:
  - `REPORTER`: Strictly restricted to tickets where `reporterId == authUser.userId`.
  - `AGENT`: Strictly restricted to tickets where `assigneeId == authUser.userId`.
- **Authoritative Backend**: Authorization guards in services enforce security regardless of UI state.
- **Zero Sensitive Data Exposure**: Password hashes are never exposed through GraphQL types or logged.

---

## 11. Architectural Decisions & Tradeoffs

1. **Calculated vs Persisted SLA**:
   - *Decision*: SLA state and deadlines are computed dynamically upon request.
   - *Rationale*: Eliminates background polling daemons, database write contention, and synchronization drift when tickets remain inactive.
2. **Keyset Cursor Pagination vs Offset Pagination**:
   - *Decision*: Composite cursor `(createdAt DESC, id DESC)` encoded in Base64.
   - *Rationale*: Prevents duplicate and skipped records during active ticket creation and provides $O(1)$ indexed query performance.
3. **Thin Resolvers & Service Layer**:
   - *Decision*: Resolvers do not contain database calls or calculations.
   - *Rationale*: Maximizes testability with mock contexts and promotes reuse across GraphQL queries and mutations.
4. **Prisma 7 with `@prisma/adapter-pg`**:
   - *Decision*: Official PostgreSQL driver adapter.
   - *Rationale*: Native connection pooling and robust compatibility with Prisma 7 ORM.

---

## 12. Future Improvements

- **Real-Time Subscriptions**: GraphQL WebSocket subscriptions for live ticket updates and SLA warnings.
- **Notification Webhooks**: Slack/Email triggers when tickets transition to `AT_RISK` or `BREACHED`.
- **Distributed Caching**: Redis caching for frequently accessed holiday dates and agent profiles.
- **CI/CD Automation**: GitHub Actions workflow running `bun run sanity` on pull requests.
