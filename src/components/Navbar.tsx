import React from "react";
import type { User } from "../types/api.ts";

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onNavigateHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onNavigateHome,
}) => {
  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={onNavigateHome}>
        <div className="navbar-logo">ST</div>
        <span>Support Ticket SLA Tracker</span>
      </div>

      <div className="navbar-nav">
        {user ? (
          <>
            <div className="user-badge">
              <span>{user.name}</span>
              <span
                className={`role-pill ${
                  user.role === "AGENT" ? "agent" : "reporter"
                }`}
              >
                {user.role}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onLogout}
            >
              Logout
            </button>
          </>
        ) : null}
      </div>
    </nav>
  );
};
