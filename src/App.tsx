import React, { useState, useEffect } from "react";
import type { User } from "./types/api.ts";
import { getStoredToken, getStoredUser, clearStoredSession } from "./client/auth.ts";
import { graphqlRequest } from "./client/graphql.ts";
import { Navbar } from "./components/Navbar.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { RegisterPage } from "./pages/RegisterPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { TicketPage } from "./pages/TicketPage.tsx";

type Route =
  | { name: "login" }
  | { name: "register" }
  | { name: "dashboard" }
  | { name: "ticket"; id: string };

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(getStoredUser());
  const [route, setRoute] = useState<Route>(() => {
    if (getStoredToken()) {
      return { name: "dashboard" };
    }
    return { name: "login" };
  });

  // Verify session validity on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getStoredToken();
      if (token) {
        try {
          const data = await graphqlRequest<{ me: User | null }>(`
            query Me {
              me {
                id
                name
                email
                role
                createdAt
                updatedAt
              }
            }
          `);
          if (data.me) {
            setCurrentUser(data.me);
          } else {
            clearStoredSession();
            setCurrentUser(null);
            setRoute({ name: "login" });
          }
        } catch {
          // Token invalid or network error
          clearStoredSession();
          setCurrentUser(null);
          setRoute({ name: "login" });
        }
      }
    };

    checkAuth();
  }, []);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setRoute({ name: "dashboard" });
  };

  const handleLogout = () => {
    clearStoredSession();
    setCurrentUser(null);
    setRoute({ name: "login" });
  };

  const handleNavigateHome = () => {
    if (currentUser) {
      setRoute({ name: "dashboard" });
    } else {
      setRoute({ name: "login" });
    }
  };

  return (
    <div className="app-container">
      <Navbar
        user={currentUser}
        onLogout={handleLogout}
        onNavigateHome={handleNavigateHome}
      />

      <main className="main-content">
        {route.name === "login" && (
          <LoginPage
            onSuccess={handleLoginSuccess}
            onNavigateRegister={() => setRoute({ name: "register" })}
          />
        )}

        {route.name === "register" && (
          <RegisterPage
            onSuccess={handleLoginSuccess}
            onNavigateLogin={() => setRoute({ name: "login" })}
          />
        )}

        {route.name === "dashboard" && currentUser && (
          <DashboardPage
            user={currentUser}
            onSelectTicket={(ticketId) => setRoute({ name: "ticket", id: ticketId })}
          />
        )}

        {route.name === "ticket" && currentUser && (
          <TicketPage
            ticketId={route.id}
            currentUser={currentUser}
            onBack={() => setRoute({ name: "dashboard" })}
          />
        )}
      </main>
    </div>
  );
};
