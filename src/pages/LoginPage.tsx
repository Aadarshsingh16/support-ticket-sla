import React, { useState } from "react";
import { graphqlRequest } from "../client/graphql.ts";
import { setStoredSession } from "../client/auth.ts";
import type { AuthPayload, User } from "../types/api.ts";

interface LoginPageProps {
  onSuccess: (user: User) => void;
  onNavigateRegister: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSuccess,
  onNavigateRegister,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError(null);

    const query = `
      mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
          token
          user {
            id
            name
            email
            role
            createdAt
            updatedAt
          }
        }
      }
    `;

    try {
      const data = await graphqlRequest<{ login: AuthPayload }>(query, {
        email: email.trim(),
        password,
      });

      setStoredSession(data.login.token, data.login.user);
      onSuccess(data.login.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card auth-card">
      <div className="auth-header">
        <h1>Welcome Back</h1>
        <p>Log in to access your support tickets and SLA tracking.</p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input
            type="email"
            className="form-input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-input"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: "0.5rem" }}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Log In"}
        </button>
      </form>

      <div className="auth-footer">
        Don&apos;t have an account?{" "}
        <span className="text-link" onClick={onNavigateRegister}>
          Register here
        </span>
      </div>
    </div>
  );
};
