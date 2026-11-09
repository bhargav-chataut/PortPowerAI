
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import VesselMap from "../components/VesselMap";

import {
  MONITORING_REGIONS,
  isInMonitoringRegion,
} from "../utils/monitoringRegions";

import {
  getVesselFreshness,
  formatLastReceived,
} from "../utils/vesselFreshness";

import {
  fetchVessels,
  type Vessel,
  type MonitoringRegion,
} from "../services/vesselApi";

import { logout } from "../services/authApi";

type DashboardView = "map" | "list";

interface FleetDashboardProps {
  region: MonitoringRegion;
  view?: DashboardView;
}

export default function FleetDashboard({
  region,
  view = "map",
}: FleetDashboardProps) {
  return (
    <RegionalDashboard
      key={region}
      region={region}
      view={view}
    />
  );
}

function RegionalDashboard({
  region,
  view = "map",
}: FleetDashboardProps) {
  const navigate = useNavigate();
  const port = MONITORING_REGIONS[region];

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<
    string | null
  >(null);

  const [, setClockTick] = useState(0);

  // Fetch observations for the selected monitoring region.
  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    const controller = new AbortController();

    async function loadVessels() {
      if (requestInProgress) return;

      requestInProgress = true;

      try {
        const response = await fetchVessels(
          region,
          controller.signal
        );

        if (active) {
          const regionalVessels =
            response.vessels.filter((vessel) =>
              isInMonitoringRegion(vessel, region)
            );

          setVessels(regionalVessels);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load vessel observations"
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

    const pollingInterval = setInterval(() => {
      void loadVessels();
    }, 5000);

    return () => {
      active = false;
      controller.abort();
      clearInterval(pollingInterval);
    };
  }, [region]);

  // Refresh relative freshness timestamps.
  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((value) => value + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Log out of the current manager session.
  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError(null);

    try {
      await logout();

      navigate("/login", {
        replace: true,
      });
    } catch (err) {
      setLogoutError(
        err instanceof Error
          ? err.message
          : "Unable to log out"
      );
    } finally {
      setLoggingOut(false);
    }
  }

  // Open vessel details when requested from the map.
  function openVesselDetails(mmsi: number) {
    navigate(`/vessels/${mmsi}`);
  }

  const query = search.trim().toLowerCase();

  const filteredVessels = vessels.filter(
    (vessel) =>
      vessel.name.toLowerCase().includes(query) ||
      vessel.mmsi.toString().includes(query)
  );

  // Minimal navigation styles.
  const navStyle = (active: boolean) => ({
    textDecoration: "none",
    padding: "10px 16px",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "14px",
    background: active ? "#e0f2fe" : "transparent",
    color: active ? "#0369a1" : "#475569",
  });

  const tableHeaderStyle = {
    padding: "14px 12px",
    textAlign: "left" as const,
    color: "#64748b",
    fontSize: "12px",
    fontWeight: 600,
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
  };

  const tableCellStyle = {
    padding: "15px 12px",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "13px",
    color: "#334155",
  };

  return (
    <main
      style={{
        maxWidth: "1600px",
        margin: "0 auto",
        padding: "20px 24px",
        color: "#0f172a",
      }}
    >
      {/* Application header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "25px",
              margin: 0,
              fontWeight: 700,
              letterSpacing: "-0.5px",
            }}
          >
            PortPower AI
          </h1>

          <p
            style={{
              margin: "5px 0 0",
              color: "#64748b",
              fontSize: "13px",
            }}
          >
            {port.name} · {port.location}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          style={{
            padding: "9px 16px",
            borderRadius: "8px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#475569",
            fontWeight: 500,
            cursor: loggingOut
              ? "not-allowed"
              : "pointer",
          }}
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </header>

      {logoutError && (
        <p role="alert" style={{ color: "#dc2626" }}>
          {logoutError}
        </p>
      )}

      {/* Dashboard navigation */}
      <nav
        aria-label="Dashboard navigation"
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: "12px",
          marginBottom: "22px",
        }}
      >
        {/* Map */}
        <Link
          to={`/${region}`}
          style={navStyle(view === "map")}
          aria-current={
            view === "map" ? "page" : undefined
          }
        >
          Map
        </Link>

        {/* Vessel list */}
        <Link
          to={`/${region}/vessels`}
          style={navStyle(view === "list")}
          aria-current={
            view === "list" ? "page" : undefined
          }
        >
          Vessel List
        </Link>

        {/* Equipment Management */}
        <Link to={`/${region}/berths`} style={navStyle(false)}>Berths</Link>
        <Link
          to={`/${region}/equipment`}
          style={navStyle(false)}
        >
          Equipment
        </Link>

        <Link
         to={`/${region}/arrivals`}
         style={navStyle(false)}
        >
        Vessel Arrivals
         </Link>

        {/* Gulfport operations simulation */}
        {region === "gulfport" && (
          <Link
            to="/operations"
            style={navStyle(false)}
          >
            Port Operations
          </Link>
        )}
      </nav>

      {/* Page title and vessel count */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "21px",
              fontWeight: 600,
              margin: 0,
            }}
          >
            {view === "map"
              ? "Vessel Monitoring"
              : "Vessel List"}
          </h2>

          <p
            style={{
              color: "#64748b",
              fontSize: "13px",
              marginTop: "5px",
            }}
          >
            {port.name} monitoring area
          </p>
        </div>

        <span
          style={{
            fontSize: "13px",
            color: "#475569",
            background: "#f1f5f9",
            borderRadius: "8px",
            padding: "8px 12px",
          }}
        >
          {vessels.length} tracked vessels
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <p role="status">
          Loading vessel observations...
        </p>
      )}

      {/* API error state */}
      {error && (
        <p role="alert" style={{ color: "#dc2626" }}>
          Unable to refresh observations: {error}
        </p>
      )}

      {!loading && (
        <>
          {view === "map" ? (
            /* Main landing page: Map first */
            <section>
              <VesselMap
                vessels={vessels}
                selectedMmsi={null}
                onSelectVessel={openVesselDetails}
                historyPositions={[]}
                center={port.center}
              />

              {vessels.length === 0 && !error && (
                <p
                  role="status"
                  style={{
                    fontSize: "13px",
                    color: "#64748b",
                    paddingTop: "8px",
                  }}
                >
                  No AIS observations currently
                  available in this monitoring area.
                </p>
              )}
            </section>
          ) : (
            /* Separate vessel list page */
            <section>
              <input
                type="search"
                aria-label="Search vessels"
                placeholder="Search vessel name or MMSI..."
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                style={{
                  width: "100%",
                  maxWidth: "420px",
                  padding: "12px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxSizing: "border-box",
                }}
              />

              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr>
                      <th style={tableHeaderStyle}>
                        Vessel
                      </th>

                      <th style={tableHeaderStyle}>
                        MMSI
                      </th>

                      <th style={tableHeaderStyle}>
                        Speed
                      </th>

                      <th style={tableHeaderStyle}>
                        Status
                      </th>

                      <th style={tableHeaderStyle}>
                        Last Received
                      </th>

                      <th style={tableHeaderStyle}>
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredVessels.map((vessel) => {
                      const freshness =
                        getVesselFreshness(
                          vessel.lastUpdated
                        );

                      const statusColor =
                        freshness === "recent"
                          ? "#15803d"
                          : freshness === "aging"
                            ? "#b45309"
                            : freshness === "stale"
                              ? "#b91c1c"
                              : "#64748b";

                      return (
                        <tr key={vessel.mmsi}>
                          <td style={tableCellStyle}>
                            <strong>
                              {vessel.name}
                            </strong>
                          </td>

                          <td style={tableCellStyle}>
                            {vessel.mmsi}
                          </td>

                          <td style={tableCellStyle}>
                            {vessel.speedKnots === null
                              ? "Unknown"
                              : `${vessel.speedKnots} kn`}
                          </td>

                          <td style={tableCellStyle}>
                            <span
                              style={{
                                color: statusColor,
                                fontWeight: 600,
                                textTransform: "capitalize",
                              }}
                            >
                              {freshness}
                            </span>
                          </td>

                          <td style={tableCellStyle}>
                            {formatLastReceived(
                              vessel.lastUpdated
                            )}
                          </td>

                          <td style={tableCellStyle}>
                            <Link
                              to={`/vessels/${vessel.mmsi}`}
                              style={{
                                color: "#0369a1",
                                textDecoration: "none",
                                fontWeight: 600,
                              }}
                            >
                              View Details
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredVessels.length === 0 && (
                <p
                  role="status"
                  style={{
                    color: "#64748b",
                    fontSize: "14px",
                    padding: "18px 0",
                  }}
                >
                  {query
                    ? "No vessels match your search."
                    : "No vessel observations available."}
                </p>
              )}
            </section>
          )}
        </>
      )}

      {/* Observation disclaimer */}
      <footer
        style={{
          marginTop: "24px",
          color: "#64748b",
          fontSize: "12px",
        }}
      >
        AIS positions represent received observations,
        not guaranteed current vessel locations.
      </footer>
    </main>
  );
}
