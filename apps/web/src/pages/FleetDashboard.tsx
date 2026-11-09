
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import VesselMap from "../components/VesselMap";
import { MONITORING_REGIONS, isInMonitoringRegion } from "../utils/monitoringRegions";

import {
  getVesselFreshness,
  formatLastReceived,
} from "../utils/vesselFreshness";

import {
  fetchVessels,
  type Vessel,
  type MonitoringRegion,
} from "../services/vesselApi";

interface FleetDashboardProps {
  region: MonitoringRegion;
}

export default function FleetDashboard({
  region,
}: FleetDashboardProps) {
  // Remount before rendering a different port: no old data, search, or map state.
  return <RegionalFleetDashboard key={region} region={region} />;
}

function RegionalFleetDashboard({
  region,
}: FleetDashboardProps) {
  const navigate = useNavigate();
  const port = MONITORING_REGIONS[region];

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [, setClockTick] = useState(0);

  function openVesselDetails(mmsi: number) {
    navigate(`/vessels/${mmsi}`);
  }

  // Poll the region-specific vessel API.
  useEffect(() => {
    let active = true;
    let requestInProgress = false;
    const controller = new AbortController();

    // Reset when switching ports.
    setVessels([]);
    setLoading(true);
    setError(null);

    async function loadVessels() {
      if (requestInProgress) return;

      requestInProgress = true;

      try {
        const result = await fetchVessels(region, controller.signal);

        if (active) {
          setVessels(result.vessels.filter((vessel) => isInMonitoringRegion(vessel, region)));
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load vessels"
          );
        }
      } finally {
        requestInProgress = false;

        if (active) {
          setLoading(false);
        }
      }
    }

    void loadVessels();

    const interval = setInterval(() => {
      void loadVessels();
    }, 5000);

    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [region]);

  // Refresh relative timestamps.
  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((value) => value + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const query = search.trim().toLowerCase();

  const filteredVessels = vessels.filter(
    (vessel) =>
      vessel.name.toLowerCase().includes(query) ||
      vessel.mmsi.toString().includes(query)
  );

  const recentCount = vessels.filter(
    (vessel) =>
      getVesselFreshness(vessel.lastUpdated) === "recent"
  ).length;

  const agingCount = vessels.filter(
    (vessel) =>
      getVesselFreshness(vessel.lastUpdated) === "aging"
  ).length;

  const staleCount = vessels.filter(
    (vessel) =>
      getVesselFreshness(vessel.lastUpdated) === "stale"
  ).length;

  return (
    <main
      style={{
        maxWidth: "1400px",
        margin: "auto",
        padding: "24px",
      }}
    >
      <header style={{ marginBottom: "28px" }}>
        <h1>PortPower AI</h1>

        <p>Maritime Monitoring & Operations Platform</p>

        {/* Port navigation */}
        <nav
          aria-label="Port navigation"
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "20px",
            marginBottom: "24px",
          }}
        >
          <Link
            to="/gulfport"
            aria-current={
              region === "gulfport" ? "page" : undefined
            }
            style={{
              padding: "12px 20px",
              borderRadius: "8px",
              background:
                region === "gulfport"
                  ? "#0284c7"
                  : "#e2e8f0",
              color:
                region === "gulfport"
                  ? "white"
                  : "#0f172a",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Gulfport
          </Link>

          <Link
            to="/miami"
            aria-current={
              region === "miami" ? "page" : undefined
            }
            style={{
              padding: "12px 20px",
              borderRadius: "8px",
              background:
                region === "miami"
                  ? "#0284c7"
                  : "#e2e8f0",
              color:
                region === "miami"
                  ? "white"
                  : "#0f172a",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Miami
          </Link>
          <Link to="/operations" style={{ padding: "12px 20px", fontWeight: 600 }}>
            Port operations (simulated)
          </Link>
        </nav>

        <h2>{port.name}</h2>
        <p>{port.location} — {port.description}</p>

        <p style={{ fontSize: "13px", opacity: 0.75 }}>
          Monitoring real AIS position reports within a
          defined geographic rectangle. Position freshness
          represents backend receipt time, not guaranteed
          current vessel location. Port operating data will
          be simulated.
        </p>
      </header>

      {loading && <p role="status">Loading vessel data for {port.name}...</p>}

      {error && (
        <p role="alert" style={{ color: "#dc2626" }}>
          Unable to refresh {port.name}: {error}. Retrying every 5 seconds.
        </p>
      )}

      {!loading && (
        <>
          {/* Overview */}
          <section>
            <h2>Fleet Overview</h2>

            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <div className="stat-card">
                <h3>Tracked Vessels</h3>
                <p>{vessels.length}</p>
              </div>

              <div className="stat-card">
                <h3>Recent</h3>
                <p>{recentCount}</p>
              </div>

              <div className="stat-card">
                <h3>Aging</h3>
                <p>{agingCount}</p>
              </div>

              <div className="stat-card">
                <h3>Stale</h3>
                <p>{staleCount}</p>
              </div>
            </div>

            <input
              type="search"
              placeholder="Search vessel name or MMSI..."
              aria-label="Search vessels"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              style={{
                padding: "12px",
                width: "100%",
                maxWidth: "450px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "15px",
              }}
            />

            <p style={{ marginTop: "12px" }}>
              Showing {filteredVessels.length} of{" "}
              {vessels.length} vessels
            </p>
          </section>

          {/* Map */}
          <section>
            <h2>{port.name} — Vessel Map</h2>

              <VesselMap
                key={region}
                vessels={filteredVessels}
                selectedMmsi={null}
                onSelectVessel={openVesselDetails}
                historyPositions={[]}
                center={port.center}
              />
            {filteredVessels.length === 0 && !error && (
              <p role="status">
                {query
                  ? "No vessels match your search."
                  : `No AIS vessel observations are currently available within the ${port.name} monitoring rectangle. Waiting for new reports; this dashboard refreshes every 5 seconds.`}
              </p>
            )}
          </section>

          {/* Vessel table */}
          <section>
            <h2>Tracked Vessels</h2>

            <p>
              Select a vessel to open its dedicated
              Vessel Intelligence page.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>MMSI</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Speed (knots)</th>
                    <th>Status</th>
                    <th>Last Received</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredVessels.map((vessel) => (
                    <tr key={vessel.mmsi}>
                      <td>{vessel.name}</td>
                      <td>{vessel.mmsi}</td>
                      <td>
                        {vessel.latitude.toFixed(4)}
                      </td>
                      <td>
                        {vessel.longitude.toFixed(4)}
                      </td>
                      <td>
                        {vessel.speedKnots ?? "Unknown"}
                      </td>
                      <td>
                        <span
                          className={`freshness-badge ${getVesselFreshness(
                            vessel.lastUpdated
                          )}`}
                        >
                          {getVesselFreshness(
                            vessel.lastUpdated
                          )}
                        </span>
                      </td>
                      <td>
                        {formatLastReceived(
                          vessel.lastUpdated
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/vessels/${vessel.mmsi}`}
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
