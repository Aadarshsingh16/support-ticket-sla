import React from "react";
import type { SLAState, TicketPriority, TicketStatus } from "../types/api.ts";

interface TicketFiltersProps {
  search: string;
  status: TicketStatus | "";
  priority: TicketPriority | "";
  slaState: SLAState | "";
  onSearchChange: (val: string) => void;
  onStatusChange: (val: TicketStatus | "") => void;
  onPriorityChange: (val: TicketPriority | "") => void;
  onSlaStateChange: (val: SLAState | "") => void;
  onReset: () => void;
}

export const TicketFilters: React.FC<TicketFiltersProps> = ({
  search,
  status,
  priority,
  slaState,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onSlaStateChange,
  onReset,
}) => {
  return (
    <div className="filters-bar">
      <input
        type="text"
        className="form-input"
        placeholder="Search title or description..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <select
        className="form-select"
        value={status}
        onChange={(e) => onStatusChange(e.target.value as TicketStatus | "")}
      >
        <option value="">All Statuses</option>
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="RESOLVED">Resolved</option>
        <option value="CLOSED">Closed</option>
      </select>

      <select
        className="form-select"
        value={priority}
        onChange={(e) => onPriorityChange(e.target.value as TicketPriority | "")}
      >
        <option value="">All Priorities</option>
        <option value="URGENT">Urgent</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>

      <select
        className="form-select"
        value={slaState}
        onChange={(e) => onSlaStateChange(e.target.value as SLAState | "")}
      >
        <option value="">All SLA States</option>
        <option value="ON_TRACK">On Track</option>
        <option value="AT_RISK">At Risk</option>
        <option value="BREACHED">Breached</option>
      </select>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onReset}
      >
        Clear Filters
      </button>
    </div>
  );
};
