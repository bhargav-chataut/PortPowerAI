import { useEffect, useMemo, useState } from "react";
import VesselMap from "./VesselMap";
import { fetchVesselHistory, type Vessel, type VesselPosition } from "../services/vesselApi";
import { getArrivals, type Arrival } from "../services/arrivalApi";
import { getVesselFreshness, formatLastReceived } from "../utils/vesselFreshness";
import "./VesselDrawer.css";

type Tab = "overview" | "history" | "operations";
type Range = "1h" | "24h" | "all";

interface Props {
  mmsi: number;
  vessel: Vessel | null;
  onClose: () => void;
}

export default function VesselDrawer({ mmsi, vessel, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("all");
  const [history, setHistory] = useState<VesselPosition[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [arrivals, setArrivals] = useState<Arrival[] | null>(null);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    setTab("overview");
    setRange("all");
    setHistory([]);
    setArrivals(null);
    setHistoryError(null);
    setOperationsError(null);
  }, [mmsi]);

  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (tab !== "history") return;
    let active = true;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchVesselHistory(mmsi, 100).then(response => {
      if (active) setHistory(response.positions);
    }).catch(error => {
      if (active) setHistoryError(error instanceof Error ? error.message : "Unable to load vessel history.");
    }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [mmsi, tab, historyRefresh]);

  useEffect(() => {
    if (tab !== "operations" || arrivals !== null) return;
    let active = true;
    setOperationsError(null);
    getArrivals().then(data => {
      if (active) setArrivals(data);
    }).catch(error => {
      if (active) setOperationsError(error instanceof Error ? error.message : "Unable to load planning records.");
    });
    return () => { active = false; };
  }, [mmsi, tab, arrivals]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);

  const filtered = useMemo(() => {
    const cutoff = range === "all" ? -Infinity : clock - (range === "1h" ? 1 : 24) * 3600000;
    return history.filter(p => {
      const t = new Date(p.received_at).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= clock;
    }).sort((a,b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
  }, [history, range, clock]);
  const speeds = filtered.map(p => p.speed_knots).filter((v): v is number => v != null);
  const avg = speeds.length ? speeds.reduce((a,b) => a+b,0)/speeds.length : null;
  const latest = filtered[filtered.length - 1];
  const matched = arrivals?.filter(a => a.mmsi === String(mmsi)) ?? [];
  const freshness = vessel ? getVesselFreshness(vessel.lastUpdated) : "unknown";

  return <>
    <button type="button" className="vd-overlay" onClick={onClose} aria-label="Close vessel details" />
    <aside className={`vd-drawer ${tab === "history" ? "vd-wide" : ""}`} role="dialog" aria-modal="true" aria-label={`Vessel ${mmsi} details`}>
      <header className="vd-header">
        <div><div className="vd-eyebrow">VESSEL INTELLIGENCE · AIS</div><h2>{vessel?.name || "Vessel details"}</h2><span>MMSI {mmsi}</span></div>
        <button type="button" className="vd-close" onClick={onClose} aria-label="Close vessel details">✕</button>
      </header>
      <nav className="vd-tabs" aria-label="Vessel information tabs">
        {(["overview","history","operations"] as Tab[]).map(t =>
          <button type="button" key={t} className={tab === t ? "vd-active" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>{t === "overview" ? "Overview" : t === "history" ? "History" : "Operations"}</button>
        )}
      </nav>
      <div className="vd-body">
        {tab === "overview" && <>
          <div className="vd-label">LATEST AIS OBSERVATION</div>
          <div className="vd-status"><span className={`vd-status-dot vd-${freshness}`}/>{vessel ? `${freshness} position` : "Not in current AIS feed"}</div>
          {vessel ? <>
            <div className="vd-summary"><div><small>Reported speed</small><strong>{vessel.speedKnots == null ? "Unknown" : `${vessel.speedKnots} kn`}</strong></div><div><small>Last received</small><strong>{formatLastReceived(vessel.lastUpdated)}</strong></div></div>
            <div className="vd-label">REPORTED POSITION</div>
            <dl className="vd-facts"><div><dt>Latitude</dt><dd>{vessel.latitude.toFixed(6)}</dd></div><div><dt>Longitude</dt><dd>{vessel.longitude.toFixed(6)}</dd></div><div><dt>Received</dt><dd>{new Date(vessel.lastUpdated).toLocaleString()}</dd></div></dl>
          </> : <p className="vd-note">This vessel does not currently have a position in this port’s monitored area. Historical observations may still be available.</p>}
          <button className="vd-cta" type="button" onClick={() => setTab("history")}>Explore movement history <span>↗</span></button>
        </>}
        {tab === "history" && <>
          <div className="vd-history-controls"><div><div className="vd-label">HISTORICAL MOVEMENT</div><h3>Recorded position trail</h3></div><div className="vd-control-group"><label>Time range <select value={range} onChange={e=>setRange(e.target.value as Range)}><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="all">All loaded</option></select></label><button disabled={historyLoading} type="button" onClick={() => setHistoryRefresh(x=>x+1)}>↻ Refresh</button></div></div>
          {historyLoading && <p role="status">Loading stored positions…</p>}
          {historyError && <p className="vd-error" role="alert">{historyError}</p>}
          <div className="vd-history-stats"><div><small>Positions shown</small><strong>{filtered.length}</strong></div><div><small>Average reported speed</small><strong>{avg == null ? "—" : `${avg.toFixed(2)} kn`}</strong></div><div><small>Latest stored speed</small><strong>{latest?.speed_knots == null ? "—" : `${latest.speed_knots} kn`}</strong></div></div>
          <div className="vd-history-map">{(vessel || filtered.length > 0) ? <VesselMap vessels={vessel ? [vessel] : []} selectedMmsi={mmsi} historyPositions={filtered} onSelectVessel={()=>{}} /> : <div className="vd-empty">No positions for this time range.</div>}</div>
          <div className="vd-label">RECORDED POSITIONS</div>
          <div className="vd-table-scroll"><table><thead><tr><th>Received</th><th>Latitude</th><th>Longitude</th><th>Speed</th></tr></thead><tbody>{filtered.slice().reverse().map(p => <tr key={p.id}><td>{new Date(p.received_at).toLocaleString()}</td><td>{p.latitude.toFixed(5)}</td><td>{p.longitude.toFixed(5)}</td><td>{p.speed_knots == null ? "—" : `${p.speed_knots} kn`}</td></tr>)}</tbody></table></div>
        </>}
        {tab === "operations" && <>
          <div className="vd-label">PORT PLANNING RECORDS</div><h3>Linked arrivals</h3>
          <p className="vd-note">These are manager-entered plans, separate from AIS observations. Matching by MMSI does not verify an arrival or berth assignment.</p>
          {operationsError && <p role="alert" className="vd-error">{operationsError}</p>}
          {arrivals === null && !operationsError && <p role="status">Loading arrival records…</p>}
          {arrivals !== null && matched.length === 0 && <div className="vd-empty">No linked arrival record for this MMSI.</div>}
          {matched.map(a => <article className="vd-arrival" key={String(a.id)}><strong>{a.vessel_name || "Planned arrival"}</strong><dl className="vd-facts"><div><dt>Planned ETA</dt><dd>{new Date(a.planned_eta).toLocaleString()}</dd></div><div><dt>Cargo</dt><dd>{a.cargo_type} · {a.workload_quantity} {a.workload_unit}</dd></div><div><dt>Status</dt><dd>{a.status.replaceAll("_"," ")}</dd></div><div><dt>Preferred berth</dt><dd>{a.preferred_berth_name ?? (a.preferred_berth_id ? `Berth ID ${a.preferred_berth_id}` : "Unassigned")}</dd></div></dl></article>)}
          <p className="vd-note">Equipment allocation and schedule optimization are not yet connected to this panel.</p>
        </>}
      </div>
      <footer className="vd-footer">AIS observations are not guaranteed current vessel locations. Historic trails connect sampled positions, not navigational routes.</footer>
    </aside>
  </>;
}
