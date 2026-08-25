import React, { useState, useEffect, useCallback } from "react";
import { graphqlRequest } from "../client/graphql.ts";
import type {
  Ticket,
  TicketConnection,
  TicketPriority,
  TicketStatus,
  User,
} from "../types/api.ts";
import { TicketCard } from "../components/TicketCard.tsx";
import { TicketFilters } from "../components/TicketFilters.tsx";
import { TicketForm } from "../components/TicketForm.tsx";

interface DashboardPageProps {
  user: User;
  onSelectTicket: (ticketId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  onSelectTicket,
}) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "">("");
  const [priority, setPriority] = useState<TicketPriority | "">("");

  // Create form modal / toggle
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTickets = useCallback(
    async (cursor?: string | null, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const query = `
        query GetTickets(
          $first: Int
          $after: String
          $search: String
          $status: TicketStatus
          $priority: TicketPriority
        ) {
          tickets(
            first: $first
            after: $after
            search: $search
            status: $status
            priority: $priority
          ) {
            nodes {
              id
              title
              description
              priority
              status
              reporterId
              assigneeId
              createdAt
              updatedAt
              firstRespondedAt
              resolvedAt
              reporter {
                id
                name
                email
                role
              }
              assignee {
                id
                name
                email
                role
              }
              comments {
                id
              }
              sla {
                responseDueAt
                resolutionDueAt
                responseState
                resolutionState
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      const variables: Record<string, unknown> = {
        first: 20,
      };

      if (cursor) {
        variables.after = cursor;
      }
      if (search.trim()) {
        variables.search = search.trim();
      }
      if (status) {
        variables.status = status;
      }
      if (priority) {
        variables.priority = priority;
      }

      try {
        const data = await graphqlRequest<{ tickets: TicketConnection }>(
          query,
          variables
        );

        if (append) {
          setTickets((prev) => [...prev, ...data.tickets.nodes]);
        } else {
          setTickets(data.tickets.nodes);
        }

        setHasNextPage(data.tickets.pageInfo.hasNextPage);
        setEndCursor(data.tickets.pageInfo.endCursor ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tickets.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, status, priority]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTickets();
    }, 250);

    return () => clearTimeout(timer);
  }, [fetchTickets]);

  const handleLoadMore = () => {
    if (hasNextPage && endCursor) {
      fetchTickets(endCursor, true);
    }
  };

  const handleCreateTicket = async (
    title: string,
    description: string,
    ticketPriority: TicketPriority
  ) => {
    const mutation = `
      mutation CreateTicket($title: String!, $description: String!, $priority: TicketPriority!) {
        createTicket(title: $title, description: $description, priority: $priority) {
          id
          title
        }
      }
    `;

    await graphqlRequest<{ createTicket: Ticket }>(mutation, {
      title,
      description,
      priority: ticketPriority,
    });

    setShowCreateForm(false);
    setSuccessMessage("Ticket created successfully!");
    setTimeout(() => setSuccessMessage(null), 4000);
    fetchTickets();
  };

  const handleResetFilters = () => {
    setSearch("");
    setStatus("");
    setPriority("");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {user.role === "AGENT" ? "Assigned Tickets" : "My Support Tickets"}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Track, manage, and monitor SLA compliance in real-time.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "Close Form" : "+ Create Ticket"}
        </button>
      </div>

      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}

      {showCreateForm && (
        <TicketForm
          onSubmit={handleCreateTicket}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <TicketFilters
        search={search}
        status={status}
        priority={priority}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onPriorityChange={setPriority}
        onReset={handleResetFilters}
      />

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          Loading tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>
          <h3 style={{ fontSize: "1.1rem", marginBottom: "0.25rem", color: "var(--text-main)" }}>
            No tickets found
          </h3>
          <p style={{ fontSize: "0.9rem" }}>
            {search || status || priority
              ? "Try adjusting your search or filter parameters."
              : "No tickets have been created yet. Click '+ Create Ticket' to get started."}
          </p>
        </div>
      ) : (
        <>
          <div className="ticket-list">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onSelectTicket(ticket.id)}
              />
            ))}
          </div>

          {hasNextPage && (
            <div style={{ textAlign: "center", marginTop: "2rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading more..." : "Load More Tickets"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
