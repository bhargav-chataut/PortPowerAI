import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { PortCode } from "../services/authApi";
import { logout } from "../services/authApi";
import "../pages/FleetDashboard.css";
import "./ManagementTheme.css";

/** Keep the same navigation geometry as the live AIS dashboard on manager pages. */
export default function ManagerWorkspace({ port, children }: { port: PortCode; children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const portName = port === "gulfport" ? "Port of Gulfport" : "PortMiami";
  const portLocation = port === "gulfport" ? "Mississippi" : "Florida";
  const links = [
    { label: "Overview", symbol: "◫", to: `/${port}` },
    { label: "Live vessels", symbol: "◉", to: `/${port}/vessels` },
    { label: "Berths", symbol: "▥", to: `/${port}/berths` },
    { label: "Equipment", symbol: "▤", to: `/${port}/equipment` },
    { label: "Arrivals", symbol: "↗", to: `/${port}/arrivals` },
    { label: "Planning calendar", symbol: "▦", to: `/${port}/planning` },
  ];
  const active = links.find(link => link.to === location.pathname);
  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : "Unable to log out.");
    } finally {
      setLoggingOut(false);
    }
  }
  return <div className="pp-shell pp-management-shell">
    <button className="pp-mobile-toggle" type="button" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}>☰ <span>PortPower AI</span></button>
    {sidebarOpen && <button type="button" className="pp-sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <aside className={`pp-sidebar ${sidebarOpen ? "pp-sidebar-open" : ""}`}>
      <div className="pp-brand"><div className="pp-brand-mark">P<span>✦</span></div><div><strong>PORTPOWER<span>AI</span></strong><small>MARITIME INTELLIGENCE</small></div></div>
      <div className="pp-sidebar-heading">WORKSPACE</div>
      <nav className="pp-navigation" aria-label="Primary navigation">
        {links.map(link => <Link key={link.to} to={link.to} onClick={() => setSidebarOpen(false)} aria-current={active?.to === link.to ? "page" : undefined} className={`pp-nav-item ${active?.to === link.to ? "pp-nav-active" : ""}`}>
          <span className="pp-nav-icon" aria-hidden="true">{link.symbol}</span>{link.label}{active?.to === link.to && <span className="pp-nav-indicator" />}
        </Link>)}
      </nav>
      <div className="pp-sidebar-heading pp-second-heading">PORT CONTEXT</div>
      <div className="pp-port-identity"><span className="pp-location-dot" /><div><strong>{portName}</strong><small>{portLocation}</small></div></div>
      <div className="pp-sidebar-bottom">
        <div className="pp-system-status"><span className="pp-live-dot" />Port operations workspace</div>
        <button className="pp-logout" type="button" onClick={() => void signOut()} disabled={loggingOut}>{loggingOut ? "Signing out…" : "↪  Sign out"}</button>
      </div>
    </aside>
    <div className="pp-main">
      <header className="pp-topbar"><div className="pp-breadcrumb">PORT OPERATIONS <span>/</span> {portName.toUpperCase()} <span>/</span> {(active?.label ?? "MANAGEMENT").toUpperCase()}</div><div className="pp-topbar-right"><span className="pp-user-avatar" title="Port manager">PM</span></div></header>
      <div className="pp-managed-content">
        {logoutError && <div role="alert" className="pp-alert">{logoutError}</div>}
        {children}
      </div>
    </div>
  </div>;
}
