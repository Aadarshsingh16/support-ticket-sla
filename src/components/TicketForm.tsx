import React, { useState } from "react";
import type { TicketPriority } from "../types/api.ts";

interface TicketFormProps {
  onSubmit: (title: string, description: string, priority: TicketPriority) => Promise<void>;
  onCancel: () => void;
}

export const TicketForm: React.FC<TicketFormProps> = ({ onSubmit, onCancel }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(title.trim(), description.trim(), priority);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>
        Create New Support Ticket
      </h2>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Ticket Title</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Database connection timeout in EU region"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Priority</label>
          <select
            className="form-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            disabled={loading}
          >
            <option value="LOW">Low (8h Response / 32h Resolution)</option>
            <option value="MEDIUM">Medium (4h Response / 16h Resolution)</option>
            <option value="HIGH">High (2h Response / 8h Resolution)</option>
            <option value="URGENT">Urgent (1h Response / 4h Resolution)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Description & Steps to Reproduce</label>
          <textarea
            className="form-textarea"
            placeholder="Describe the issue in detail..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Creating..." : "Submit Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
};
