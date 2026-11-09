
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import ManagerWorkspace from "./ManagerWorkspace";

import {
  getCurrentManager,
  type Manager,
  type PortCode,
} from "../services/authApi";

interface ProtectedRouteProps {
  port: PortCode;
  children: React.ReactNode;
}

export default function ProtectedRoute({
  port,
  children,
}: ProtectedRouteProps) {
  const location = useLocation();
  const [manager, setManager] = useState<Manager | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const currentManager = await getCurrentManager();

        if (active) {
          setManager(currentManager);
          setError(null);
        }
      } catch {
        if (active) {
          setError("Unable to verify your session");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <p style={{ padding: "30px" }}>Checking session...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!manager) {
    return <Navigate to="/login" replace />;
  }

  if (manager.port !== port) {
    return <Navigate to={`/${manager.port}`} replace />;
  }

  const isManagementPage = /\/(berths|equipment|arrivals)$/.test(location.pathname);
  return isManagementPage ? <ManagerWorkspace port={port}>{children}</ManagerWorkspace> : <>{children}</>;
}
