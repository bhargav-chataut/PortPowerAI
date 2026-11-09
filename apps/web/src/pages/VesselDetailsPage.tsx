import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchVessels, fetchVesselHistory, type MonitoringRegion } from "../services/vesselApi";
import { isInMonitoringRegion } from "../utils/monitoringRegions";

/** Backwards-compatible deep link: opens the contextual inspector in the relevant port workspace. */
export default function VesselDetailsPage() {
  const { mmsi: param } = useParams();
  const valid = /^\d{9}$/.test(param ?? "");
  const mmsi = Number(param);
  const [port, setPort] = useState<MonitoringRegion | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!valid) { setChecking(false); return; }
    let active = true;
    async function locate() {
      try {
        const response = await fetchVessels();
        const vessel = response.vessels.find(v => v.mmsi === mmsi);
        if (vessel) {
          const match = (["gulfport", "miami"] as MonitoringRegion[]).find(p => isInMonitoringRegion(vessel,p));
          if (match) { if (active) setPort(match); return; }
        }
        const history = await fetchVesselHistory(mmsi, 100);
        const recent = history.positions.find(p => p.region === "gulfport" || p.region === "miami");
        if (recent && active) setPort(recent.region as MonitoringRegion);
      } catch {
        // Preserve an explicit choice instead of sending an unknown vessel to the wrong port.
      } finally { if (active) setChecking(false); }
    }
    void locate();
    return () => { active = false; };
  }, [mmsi, valid]);

  if (!valid) return <main style={{padding:"36px"}}><h1>Invalid MMSI</h1><Link to="/">Return to PortPowerAI</Link></main>;
  if (checking) return <main style={{padding:"36px"}} role="status">Locating vessel in monitored ports…</main>;
  if (port) return <Navigate to={`/${port}?vessel=${mmsi}`} replace />;
  return <main style={{padding:"36px",maxWidth:660,margin:"0 auto"}}>
    <h1>Vessel not in current monitoring region</h1>
    <p>The vessel is not in the available AIS observations. Choose a port to inspect its recorded history.</p>
    <p><Link to={`/gulfport?vessel=${mmsi}`}>Open Gulfport workspace</Link> · <Link to={`/miami?vessel=${mmsi}`}>Open Miami workspace</Link></p>
  </main>;
}
