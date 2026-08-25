import React from "react";
import type { Ticket } from "../types/api.ts";
import { SLAStatusBadge } from "./SLAStatusBadge.tsx";

interface TicketCardProps {
  ticket: Ticket;
  onClick: () => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, onClick }) => {
  const formatDate = (iso: string) => {
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

  return (
    <div className="ticket-card" onClick={onClick} style={{ cursor: "pointer" }}>
      <div className="ticket-card-header">
        <h3 className="ticket-title">{ticket.title}</h3>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <span className={`badge badge-priority-${ticket.priority}`}>
            {ticket.priority}
          </span>
          <span className={`badge badge-status-${ticket.status}`}>
            {ticket.status.replace("_", " ")}
          </span>
        </div>
      </div>

      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.9rem",
          margin: "0.5rem 0",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {ticket.description}
      </p>

      <div className="ticket-sla-row">
        <SLAStatusBadge
          label="First Response"
          state={ticket.sla.responseState}
          dueAt={ticket.sla.responseDueAt}
        />
        <SLAStatusBadge
          label="Resolution"
          state={ticket.sla.resolutionState}
          dueAt={ticket.sla.resolutionDueAt}
        />
      </div>

      <div className="ticket-card-meta">
        <span>Reporter: {ticket.reporter.name}</span>
        <span>
          Assignee: {ticket.assignee ? ticket.assignee.name : "Unassigned"}
        </span>
        <span>Created: {formatDate(ticket.createdAt)}</span>
        <span>💬 {ticket.comments.length} comments</span>
      </div>
    </div>
  );
};
