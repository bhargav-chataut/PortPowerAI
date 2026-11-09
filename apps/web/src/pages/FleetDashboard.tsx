import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import VesselDrawer from "../components/VesselDrawer";
import VesselMap from "../components/VesselMap";
import { MONITORING_REGIONS, isInMonitoringRegion } from "../utils/monitoringRegions";
import { getVesselFreshness, formatLastReceived } from "../utils/vesselFreshness";
import { fetchVessels, type Vessel, type MonitoringRegion } from "../services/vesselApi";
import { logout } from "../services/authApi";
import "./FleetDashboard.css";

type DashboardView = "map" | "list";

interface FleetDashboardProps {
  region: MonitoringRegion;
  view?: DashboardView;
}

const NAV_ICONS: Record<string, string> = {
  Overview: "◫",
  "Live vessels": "◉",
  Berths: "▥",
  Equipment: "▤",
  Arrivals: "↗",
  "Planning calendar": "▦",
};

export default function FleetDashboard({ region, view = "map" }: FleetDashboardProps) {
  return <RegionalDashboard key={region} region={region} view={view} />;
}

function RegionalDashboard({ region, view = "map" }: FleetDashboardProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedParam = searchParams.get("vessel");
  const selectedMmsi = selectedParam && /^\\d{9}$/.test(selectedParam) ? Number(selectedParam) : null;
  const port = MONITORING_REGIONS[region];
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const selectedVessel = selectedMmsi == null ? null : vessels.find(v => v.mmsi === selectedMmsi) ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();

    async function loadVessels() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetchVessels(region, controller.signal);
        if (!active) return;
        setVessels(response.vessels.filter(v => isInMonitoringRegion(v, region)));
        setLastRefresh(new Date());
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load vessel observations.");
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }

    void loadVessels();
    const polling = setInterval(() => void loadVessels(), 5000);
    return () => { active = false; controller.abort(); clearInterval(polling); };
  }, [region]);

  useEffect(() => {
    const timer = setInterval(() => setClockTick(n => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const filteredVessels = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return vessels.filter(v => v.name.toLowerCase().includes(needle) || String(v.mmsi).includes(needle));
  }, [search, vessels]);

  const recentCount = vessels.filter(v => getVesselFreshness(v.lastUpdated) === "recent").length;
  const agingCount = vessels.filter(v => getVesselFreshness(v.lastUpdated) === "aging").length;
  const staleCount = vessels.filter(v => ["stale", "unknown"].includes(getVesselFreshness(v.lastUpdated))).length;

  const navItems = [
    { label: "Overview", to: `/${region}`, active: view === "map" },
    { label: "Live vessels", to: `/${region}/vessels`, active: view === "list" },
    { label: "Berths", to: `/${region}/berths`, active: false },
    { label: "Equipment", to: `/${region}/equipment`, active: false },
    { label: "Arrivals", to: `/${region}/arrivals`, active: false },
    ...(region === "gulfport" ? [{ label: "Planning calendar", to: "/operations", active: false }] : []),
  ];

  async function handleLogout() {
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

  function openVessel(mmsi: number) {
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.set("vessel", String(mmsi)); return next; });
  }

  function closeVessel() {
    setSearchParams(previous => { const next = new URLSearchParams(previous); next.delete("vessel"); return next; });
  }

  return (
    <div className="pp-shell">
      <button className="pp-mobile-toggle" type="button" onClick={() => setSidebarOpen(v => !v)} aria-label="Toggle navigation" aria-expanded={sidebarOpen}>
        ☰ <span>PortPower AI</span>
      </button>
      {sidebarOpen && <button className="pp-sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`pp-sidebar ${sidebarOpen ? "pp-sidebar-open" : ""}`}>
        <div className="pp-brand">
          <div className="pp-brand-mark">P<span>✦</span></div>
          <div><strong>PORTPOWER<span>AI</span></strong><small>MARITIME INTELLIGENCE</small></div>
        </div>

        <div className="pp-sidebar-heading">WORKSPACE</div>
        <nav aria-label="Primary navigation" className="pp-navigation">
          {navItems.map(item => (
            <Link key={item.to} to={item.to} onClick={() => setSidebarOpen(false)} aria-current={item.active ? "page" : undefined} className={`pp-nav-item ${item.active ? "pp-nav-active" : ""}`}>
              <span className="pp-nav-icon" aria-hidden="true">{NAV_ICONS[item.label]}</span>{item.label}
              {item.active && <span className="pp-nav-indicator" />}
            </Link>
          ))}
        </nav>

        <div className="pp-sidebar-heading pp-second-heading">PORT CONTEXT</div>
        <div className="pp-port-identity"><span className="pp-location-dot" /><div><strong>{port.name}</strong><small>{port.location}</small></div></div>

        <div className="pp-sidebar-bottom">
          <div className="pp-system-status"><span className={`pp-live-dot ${error ? "pp-dot-error" : ""}`} />{error ? "Feed unavailable" : loading ? "Connecting to AIS…" : "AIS feed connected"}</div>
          <button type="button" className="pp-logout" onClick={() => void handleLogout()} disabled={loggingOut}>{loggingOut ? "Signing out…" : "↪  Sign out"}</button>
        </div>
      </aside>

      <main className="pp-main">
        <header className="pp-topbar">
          <div className="pp-breadcrumb">PORT OPERATIONS <span>/</span> {port.name.toUpperCase()} <span>/</span> {view === "map" ? "OVERVIEW" : "VESSELS"}</div>
          <div className="pp-topbar-right"><span className="pp-topbar-clock">Updated {lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</span><span className="pp-user-avatar" title="Port manager">PM</span></div>
        </header>

        <div className="pp-content">
          <div className="pp-page-heading">
            <div><div className="pp-eyebrow"><span className="pp-eyebrow-line" /> LIVE PORT INTELLIGENCE</div><h1>{view === "map" ? "Command overview" : "Vessel intelligence"}</h1><p>{port.name} · {port.location} · Live AIS observations</p></div>
            <div className="pp-header-actions"><span className="pp-live-badge"><span className={`pp-live-dot ${error ? "pp-dot-error" : ""}`} />{error ? "FEED ERROR" : "LIVE AIS"}</span><Link className="pp-action-button" to={`/${region}/arrivals`}>View arrivals <span aria-hidden="true">↗</span></Link></div>
          </div>

          {logoutError && <div className="pp-alert" role="alert">{logoutError}</div>}
          {error && <div className="pp-alert" role="alert">Unable to refresh AIS observations: {error}. Showing last available data.</div>}

          {view === "list" && <div className="pp-list-intro"><span className="pp-list-intro-icon">◉</span><div><strong>Vessel directory</strong><p>Search and inspect every vessel observation in this monitoring region. AIS freshness reflects when positions were received—not guaranteed current locations.</p></div></div>}

          <div className="pp-stat-grid">
            <div className="pp-stat-card"><div className="pp-stat-label">TRACKED VESSELS <span>◉</span></div><div className="pp-stat-value">{loading ? "—" : vessels.length}<span className="pp-stat-unit"> vessels</span></div><div className="pp-stat-caption">Within monitored area</div></div>
            <div className="pp-stat-card"><div className="pp-stat-label">FRESH POSITIONS <span className="pp-accent-icon">↗</span></div><div className="pp-stat-value">{loading ? "—" : recentCount}<span className="pp-stat-unit"> vessels</span></div><div className="pp-stat-caption"><span className="pp-mini-dot pp-green" />Recently received AIS</div></div>
            <div className="pp-stat-card"><div className="pp-stat-label">AGING POSITIONS <span>◷</span></div><div className="pp-stat-value">{loading ? "—" : agingCount}<span className="pp-stat-unit"> vessels</span></div><div className="pp-stat-caption"><span className="pp-mini-dot pp-amber" />Older AIS observations</div></div>
            <div className="pp-stat-card"><div className="pp-stat-label">STALE / UNKNOWN <span>⚑</span></div><div className="pp-stat-value">{loading ? "—" : staleCount}<span className="pp-stat-unit"> vessels</span></div><div className="pp-stat-caption"><span className="pp-mini-dot pp-red" />Check before relying on positions</div></div>
          </div>

          {view === "map" && (
          <div className="pp-workspace-grid">
            <section className="pp-panel pp-map-panel">
              <div className="pp-panel-header"><div><div className="pp-panel-kicker">MONITORING</div><h2>Live vessel map</h2></div><span className="pp-panel-tag">{port.name}</span></div>
              <div className="pp-map-wrap">
                {loading ? <div className="pp-empty-map">Connecting to live vessel feed…</div> : <VesselMap vessels={vessels} selectedMmsi={selectedMmsi} onSelectVessel={openVessel} historyPositions={[]} center={port.center} />}
              </div>
              <div className="pp-map-caption"><span><span className="pp-mini-dot pp-green" /> AIS observation layer</span><span>Click a vessel to inspect →</span></div>
            </section>

            <div className="pp-side-panels">
              <section className="pp-panel pp-quick-panel"><div className="pp-panel-header"><div><div className="pp-panel-kicker">CONTROL CENTER</div><h2>Quick access</h2></div></div>
                <div className="pp-quick-links">
                  <Link to={`/${region}/berths`}><span className="pp-quick-icon">▥</span><span><strong>Berth management</strong><small>Inventory & availability</small></span><span>↗</span></Link>
                  <Link to={`/${region}/equipment`}><span className="pp-quick-icon">▤</span><span><strong>Equipment fleet</strong><small>Assets & maintenance</small></span><span>↗</span></Link>
                  <Link to={`/${region}/arrivals`}><span className="pp-quick-icon">↗</span><span><strong>Vessel arrivals</strong><small>Plan incoming calls</small></span><span>↗</span></Link>
                  {region === "gulfport" && <Link to="/operations"><span className="pp-quick-icon">▦</span><span><strong>Planning workspace</strong><small>Fictional scenario planner</small></span><span>↗</span></Link>}
                </div>
              </section>
              <section className="pp-panel pp-intelligence-panel"><div className="pp-panel-kicker">OPERATIONS INTELLIGENCE</div><h2>Smarter decisions, next.</h2><p>We're connecting berth schedules, equipment availability and vessel arrivals to a constraint-aware optimizer.</p><span className="pp-coming-soon">OPTIMIZER · IN DEVELOPMENT</span></section>
            </div>
          </div>

          )}

          <section className="pp-panel pp-table-panel">
            <div className="pp-panel-header pp-table-header">
              <div><div className="pp-panel-kicker">{view === "map" ? "VESSEL ACTIVITY" : "LIVE MONITORING DIRECTORY"}</div><h2>{view === "map" ? "Tracked vessel feed" : "All tracked vessels"} <span className="pp-count-pill">{filteredVessels.length}</span></h2></div>
              <div className="pp-table-actions"><input aria-label="Search vessels" type="search" placeholder="Search vessel or MMSI…" value={search} onChange={e => setSearch(e.target.value)} /><Link to={view === "map" ? `/${region}/vessels` : `/${region}`}>{view === "map" ? "View all vessels ↗" : "Return to overview ↗"}</Link></div>
            </div>
            <div className="pp-table-scroll"><table className="pp-vessel-table"><thead><tr><th>VESSEL</th><th>MMSI</th><th>SPEED</th><th>POSITION STATUS</th><th>LAST RECEIVED</th><th /></tr></thead><tbody>
              {filteredVessels.slice(0, view === "map" ? 6 : undefined).map(vessel => {
                const freshness = getVesselFreshness(vessel.lastUpdated);
                return <tr key={vessel.mmsi}><td><strong>{vessel.name || "Unnamed vessel"}</strong></td><td className="pp-mono">{vessel.mmsi}</td><td>{vessel.speedKnots == null ? "—" : `${vessel.speedKnots} kn`}</td><td><span className={`pp-freshness pp-freshness-${freshness}`}><span />{freshness}</span></td><td>{formatLastReceived(vessel.lastUpdated)}</td><td><button type="button" className="pp-row-link" onClick={() => openVessel(vessel.mmsi)} aria-label={`View ${vessel.name} details`}>↗</button></td></tr>;
              })}
            </tbody></table>{!loading && filteredVessels.length === 0 && <div className="pp-table-empty">{search ? "No vessels match your search." : "No AIS vessel observations available for this region yet."}</div>}</div>
          </section>
          <footer className="pp-footer">AIS coordinates are observed positions, not guaranteed live locations. Operational schedules are separately modeled and must not be inferred from AIS.</footer>
        </div>
      </main>
      {selectedMmsi != null && <VesselDrawer key={selectedMmsi} mmsi={selectedMmsi} vessel={selectedVessel} onClose={closeVessel} />}
    </div>
  );
}
