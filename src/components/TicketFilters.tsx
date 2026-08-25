import React from "react";
import type { TicketPriority, TicketStatus } from "../types/api.ts";

interface TicketFiltersProps {
  search: string;
  status: TicketStatus | "";
  priority: TicketPriority | "";
  onSearchChange: (val: string) => void;
  onStatusChange: (val: TicketStatus | "") => void;
  onPriorityChange: (val: TicketPriority | "") => void;
  onReset: () => void;
}

export const TicketFilters: React.FC<TicketFiltersProps> = ({
  search,
  status,
  priority,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
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
