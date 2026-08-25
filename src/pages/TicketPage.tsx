import React, { useState, useEffect, useCallback } from "react";
import { graphqlRequest } from "../client/graphql.ts";
import type { Ticket, TicketPriority, TicketStatus, User } from "../types/api.ts";
import { SLAStatusBadge } from "../components/SLAStatusBadge.tsx";
import { CommentList, CommentForm } from "../components/CommentList.tsx";

interface TicketPageProps {
  ticketId: string;
  currentUser: User;
  onBack: () => void;
}

export const TicketPage: React.FC<TicketPageProps> = ({
  ticketId,
  currentUser,
  onBack,
}) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Status & Priority inline edit states
  const [status, setStatus] = useState<TicketStatus>("OPEN");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Assignment state (for agents)
  const [targetAgentId, setTargetAgentId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = `
      query GetTicket($id: ID!) {
        ticket(id: $id) {
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
            ticketId
            authorId
            body
            createdAt
            author {
              id
              name
              role
            }
          }
          sla {
            responseDueAt
            resolutionDueAt
            responseState
            resolutionState
          }
        }
      }
    `;

    try {
      const data = await graphqlRequest<{ ticket: Ticket }>(query, {
        id: ticketId,
      });
      setTicket(data.ticket);
      setStatus(data.ticket.status);
      setPriority(data.ticket.priority);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket.");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!ticket) return;
    setUpdatingStatus(true);
    setActionError(null);

    const mutation = `
      mutation UpdateStatus($id: ID!, $status: TicketStatus) {
        updateTicket(id: $id, status: $status) {
          id
          status
          resolvedAt
          sla {
            responseState
            resolutionState
            responseDueAt
            resolutionDueAt
          }
        }
      }
    `;

    try {
      await graphqlRequest(mutation, { id: ticket.id, status: newStatus });
      setStatus(newStatus);
      setActionSuccess(`Status updated to ${newStatus}`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (newPriority: TicketPriority) => {
    if (!ticket) return;
    setActionError(null);

    const mutation = `
      mutation UpdatePriority($id: ID!, $priority: TicketPriority) {
        updateTicket(id: $id, priority: $priority) {
          id
          priority
          sla {
            responseState
            resolutionState
            responseDueAt
            resolutionDueAt
          }
        }
      }
    `;

    try {
      await graphqlRequest(mutation, { id: ticket.id, priority: newPriority });
      setPriority(newPriority);
      setActionSuccess(`Priority updated to ${newPriority}`);
      setTimeout(() => setActionSuccess(null), 3000);
      fetchTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update priority.");
    }
  };

  const handleAssignTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !targetAgentId.trim()) return;

    setAssigning(true);
    setActionError(null);

    const mutation = `
      mutation AssignTicket($ticketId: ID!, $agentId: ID!) {
        assignTicket(ticketId: $ticketId, agentId: $agentId) {
          id
          assigneeId
          assignee {
            id
            name
          }
        }
      }
    `;

    try {
      await graphqlRequest(mutation, {
        ticketId: ticket.id,
        agentId: targetAgentId.trim(),
      });
      setActionSuccess("Ticket assigned successfully!");
      setTargetAgentId("");
      setTimeout(() => setActionSuccess(null), 3000);
      fetchTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to assign ticket.");
    } finally {
      setAssigning(false);
    }
  };

  const handleAddComment = async (body: string) => {
    if (!ticket) return;

    const mutation = `
      mutation AddComment($ticketId: ID!, $body: String!) {
        addComment(ticketId: $ticketId, body: $body) {
          id
        }
      }
    `;

    await graphqlRequest(mutation, {
      ticketId: ticket.id,
      body,
    });

    fetchTicket();
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return "Not recorded";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
        Loading ticket details...
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="card">
        <div className="alert alert-danger">{error ?? "Ticket not found."}</div>
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onBack}
          style={{ marginBottom: "1rem" }}
        >
          ← Back to Dashboard
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-main)" }}>
              {ticket.title}
            </h1>
            <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Ticket ID: <code>{ticket.id}</code> • Reported by {ticket.reporter.name}
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <span className={`badge badge-priority-${ticket.priority}`}>
              {ticket.priority}
            </span>
            <span className={`badge badge-status-${ticket.status}`}>
              {ticket.status.replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      {actionError && <div className="alert alert-danger">{actionError}</div>}
      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}

      <div className="ticket-details-grid">
        {/* Left Column: Description & Comments */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
              Description
            </h2>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--text-main)", fontSize: "0.95rem" }}>
              {ticket.description}
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
              Discussion ({ticket.comments.length})
            </h2>
            <CommentList comments={ticket.comments} />
            <CommentForm onSubmit={handleAddComment} />
          </div>
        </div>

        {/* Right Column: SLA & Lifecycle Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* SLA Performance Card */}
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
              SLA Tracking (Asia/Kolkata)
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                  First Response Target
                </div>
                <SLAStatusBadge
                  label="Response"
                  state={ticket.sla.responseState}
                  dueAt={ticket.sla.responseDueAt}
                />
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
                  Actual: {formatDate(ticket.firstRespondedAt)}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                  Resolution Target
                </div>
                <SLAStatusBadge
                  label="Resolution"
                  state={ticket.sla.resolutionState}
                  dueAt={ticket.sla.resolutionDueAt}
                />
                <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
                  Resolved: {formatDate(ticket.resolvedAt)}
                </div>
              </div>
            </div>
          </div>

          {/* Ticket Lifecycle & Attributes */}
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>
              Ticket Management
            </h2>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                disabled={updatingStatus}
              >
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Priority</label>
              <select
                className="form-select"
                value={priority}
                onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>

            {/* Agent Assignment (Only visible/applicable to AGENT role) */}
            {currentUser.role === "AGENT" && (
              <form onSubmit={handleAssignTicket} style={{ marginTop: "1rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <label className="form-label">Reassign Agent</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter Agent User ID..."
                    value={targetAgentId}
                    onChange={(e) => setTargetAgentId(e.target.value)}
                    disabled={assigning}
                  />
                  <button
                    type="submit"
                    className="btn btn-secondary btn-sm"
                    disabled={assigning || !targetAgentId.trim()}
                  >
                    {assigning ? "..." : "Assign"}
                  </button>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.35rem" }}>
                  Current assignee: {ticket.assignee ? ticket.assignee.name : "Unassigned"}
                </div>
              </form>
            )}

            <div style={{ marginTop: "1.25rem", borderTop: "1px solid var(--border-color)", paddingTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
              <div>Created: {formatDate(ticket.createdAt)}</div>
              <div style={{ marginTop: "0.25rem" }}>Last Updated: {formatDate(ticket.updatedAt)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
