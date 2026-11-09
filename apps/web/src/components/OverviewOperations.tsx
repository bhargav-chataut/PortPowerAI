import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getBerths, type ManagedBerth } from "../services/berthApi";
import { getEquipment, type Equipment } from "../services/equipmentApi";
import { getArrivals, type Arrival } from "../services/arrivalApi";
import type { MonitoringRegion } from "../services/vesselApi";
import "./OverviewOperations.css";

type Snapshot = { berths: ManagedBerth[] | null; equipment: Equipment[] | null; arrivals: Arrival[] | null };
type Errors = Partial<Record<keyof Snapshot, string>>;
const initial: Snapshot = { berths: null, equipment: null, arrivals: null };

export default function OverviewOperations({ region }: { region: MonitoringRegion }) {
  const [data, setData] = useState<Snapshot>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setData(initial);
    setErrors({});
    Promise.allSettled([getBerths(controller.signal), getEquipment(controller.signal), getArrivals(controller.signal)]).then(results => {
      if (!active) return;
      const next: Snapshot = { ...initial };
      const fail: Errors = {};
      const keys: (keyof Snapshot)[] = ["berths", "equipment", "arrivals"];
      results.forEach((result, index) => {
        const key = keys[index];
        if (result.status === "fulfilled") {
          if (key === "berths") next.berths = result.value as ManagedBerth[];
          if (key === "equipment") next.equipment = result.value as Equipment[];
          if (key === "arrivals") next.arrivals = result.value as Arrival[];
        } else {
          fail[key] = result.reason instanceof Error ? result.reason.message : "Unable to load data";
        }
      });
      setData(next);
      setErrors(fail);
      setLoading(false);
    });
    return () => { active = false; controller.abort(); };
  }, [region, refresh]);

  const berthAvailable = data.berths?.filter(b => b.status === "available").length;
  const berthUnavailable = data.berths?.filter(b => b.status === "maintenance" || b.status === "closed").length;
  const equipmentAvailable = data.equipment?.filter(e => e.status === "available").length;
  const equipmentUnavailable = data.equipment?.filter(e => e.status === "maintenance" || e.status === "out_of_service").length;
  const activeArrivals = data.arrivals?.filter(a => a.status !== "cancelled" && a.status !== "completed") ?? [];
  const upcoming = activeArrivals
    .filter(a => new Date(a.planned_eta).getTime() >= Date.now())
    .sort((a,b) => new Date(a.planned_eta).getTime() - new Date(b.planned_eta).getTime());
  const missingDuration = activeArrivals.filter(a => a.estimated_service_hours == null).length;
  const alerts: { label: string; description: string; href: string; tone: "warn" | "danger" }[] = [];
  if (equipmentUnavailable) alerts.push({label: `${equipmentUnavailable} equipment unavailable`, description:"Maintenance or out-of-service assets need review.", href:`/${region}/equipment`,tone:"warn"});
  if (berthUnavailable) alerts.push({label: `${berthUnavailable} berths restricted`,description:"Berths marked closed or under maintenance.",href:`/${region}/berths`,tone:"warn"});
  if (missingDuration) alerts.push({label:`${missingDuration} arrivals missing service duration`,description:"Enter estimated service hours before scheduling.",href:`/${region}/arrivals`,tone:"danger"});
  const counts = [
    {label:"BERTH CAPACITY",value:data.berths ? `${berthAvailable} / ${data.berths.length}` : "—",note:"Available / registered",link:`/${region}/berths`},
    {label:"EQUIPMENT READY",value:data.equipment ? `${equipmentAvailable} / ${data.equipment.length}` : "—",note:"Available / registered",link:`/${region}/equipment`},
    {label:"ACTIVE ARRIVAL PLANS",value:data.arrivals ? String(activeArrivals.length) : "—",note:"Manager-entered, not AIS",link:`/${region}/arrivals`},
    {label:"SCHEDULE ALERTS",value:data.berths && data.equipment && data.arrivals ? String(alerts.length) : "—",note:"Planning checks, not verified conflicts",link:`/${region}/arrivals`},
  ];

  return <div className="ov-operations">
    <div className="ov-section-heading"><div><span className="ov-kicker">PORT OPERATIONS · MANAGER RECORDS</span><h2>Operational snapshot</h2><p>Berth inventory, equipment status and planned arrivals from your assigned port.</p></div><button type="button" onClick={()=>setRefresh(n=>n+1)} disabled={loading}>↻ {loading ? "Loading…" : "Refresh"}</button></div>
    <div className="ov-metrics">
      {counts.map(card=><Link to={card.link} key={card.label} className="ov-metric"><span>{card.label}</span><strong>{card.value}</strong><small>{loading ? "Retrieving records…" : card.note}</small></Link>)}
    </div>
    {Object.entries(errors).length > 0 && <div className="ov-error" role="alert">Some operating data is unavailable: {Object.entries(errors).map(([name,message])=>`${name}: ${message}`).join(" · ")}. AIS monitoring is unaffected.</div>}
    <div className="ov-panels">
      <section className="ov-panel">
        <div className="ov-panel-heading"><div><span className="ov-kicker">UPCOMING CALLS</span><h3>Planned vessel arrivals</h3></div><Link to={`/${region}/arrivals`}>Manage ↗</Link></div>
        {data.arrivals === null ? <p className="ov-muted">{loading ? "Loading arrivals…" : "Arrival records unavailable."}</p>
        : upcoming.length === 0 ? <p className="ov-muted">No future planned arrivals in the current records.</p>
        : <div className="ov-arrival-list">{upcoming.slice(0,4).map(a=><div className="ov-arrival" key={String(a.id)}><span className="ov-vessel-glyph">↗</span><div><strong>{a.vessel_name || `MMSI ${a.mmsi}`}</strong><small>{a.cargo_type} · {a.workload_quantity} {a.workload_unit}</small></div><div className="ov-arrival-time"><strong>{new Date(a.planned_eta).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</strong><small>{new Date(a.planned_eta).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</small></div></div>)}</div>}
      </section>
      <section className="ov-panel">
        <div className="ov-panel-heading"><div><span className="ov-kicker">NEEDS ATTENTION</span><h3>Operational flags</h3></div><span className="ov-count">{alerts.length}</span></div>
        {data.berths === null || data.equipment === null || data.arrivals === null ? <p className="ov-muted">Some planning checks are unavailable until all records load.</p>
        : alerts.length === 0 ? <div className="ov-allclear"><span>✓</span><div><strong>No current status flags</strong><small>This is not a conflict-free scheduling guarantee.</small></div></div>
        : <div className="ov-alert-list">{alerts.map(a=><Link to={a.href} className="ov-alert" key={a.label}><span className={a.tone==="danger"?"ov-alert-icon danger":"ov-alert-icon"}>!</span><div><strong>{a.label}</strong><small>{a.description}</small></div><span className="ov-arrow">↗</span></Link>)}</div>}
      </section>
    </div>
    <div className="ov-notice">Live AIS vessel locations and manager-entered operating records have separate provenance. Status flags are not verified berth conflicts or optimized recommendations.</div>
  </div>;
}
