import React from "react";
import type { SLAState } from "../types/api.ts";

interface SLAStatusBadgeProps {
  label: string;
  state: SLAState;
  dueAt?: string;
}

export const SLAStatusBadge: React.FC<SLAStatusBadgeProps> = ({
  label,
  state,
  dueAt,
}) => {
  const getIcon = (s: SLAState) => {
    switch (s) {
      case "ON_TRACK":
        return "✓";
      case "AT_RISK":
        return "⚠";
      case "BREACHED":
        return "✕";
      default:
        return "•";
    }
  };

  const formatDueTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
        " " +
        d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className={`badge-sla badge-sla-${state}`}
      title={dueAt ? `Due by ${formatDueTime(dueAt)} (Asia/Kolkata)` : undefined}
    >
      <span>{getIcon(state)}</span>
      <span>
        {label}: {state.replace("_", " ")}
      </span>
      {dueAt && (
        <span style={{ opacity: 0.8, fontSize: "0.7rem", marginLeft: "0.25rem" }}>
          (Due {formatDueTime(dueAt)})
        </span>
      )}
    </div>
  );
};
