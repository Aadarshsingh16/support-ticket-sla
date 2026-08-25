import React, { useState } from "react";
import type { Comment } from "../types/api.ts";

interface CommentListProps {
  comments: Comment[];
}

export const CommentList: React.FC<CommentListProps> = ({ comments }) => {
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

  if (comments.length === 0) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", padding: "1rem 0" }}>
        No comments yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {comments.map((comment) => (
        <div key={comment.id} className="comment-item">
          <div className="comment-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <strong style={{ color: "var(--text-main)" }}>
                {comment.author.name}
              </strong>
              <span
                className={`role-pill ${
                  comment.author.role === "AGENT" ? "agent" : "reporter"
                }`}
              >
                {comment.author.role}
              </span>
            </div>
            <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
              {formatDate(comment.createdAt)}
            </span>
          </div>
          <div className="comment-body">{comment.body}</div>
        </div>
      ))}
    </div>
  );
};

interface CommentFormProps {
  onSubmit: (body: string) => Promise<void>;
}

export const CommentForm: React.FC<CommentFormProps> = ({ onSubmit }) => {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError("Comment cannot be empty.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSubmit(body.trim());
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "1.25rem" }}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="form-group">
        <textarea
          className="form-textarea"
          placeholder="Add a comment or response..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={loading || !body.trim()}
        >
          {loading ? "Posting..." : "Post Comment"}
        </button>
      </div>
    </form>
  );
};
