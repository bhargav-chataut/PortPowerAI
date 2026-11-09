
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import VesselMap from "../components/VesselMap";

import {
  fetchVessels,
  fetchVesselHistory,
  type Vessel,
  type VesselPosition,
} from "../services/vesselApi";

import {
  getVesselFreshness,
  formatLastReceived,
} from "../utils/vesselFreshness";

type HistoryRange = "1h" | "24h" | "all";

export default function VesselDetailsPage() {
  const { mmsi: mmsiParam } = useParams();
  const mmsi = Number(mmsiParam);

  const validMmsi =
    /^\d{9}$/.test(mmsiParam ?? "") &&
    Number.isSafeInteger(mmsi);

  // Latest vessel information
  const [vessel, setVessel] = useState<Vessel | null>(null);

  // Historical vessel positions
  const [history, setHistory] = useState<VesselPosition[]>([]);
  const [historyRange, setHistoryRange] =
    useState<HistoryRange>("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Update relative time calculations
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Fetch historical positions from PostgreSQL
  useEffect(() => {
    if (!validMmsi) {
      return;
    }

    let active = true;

    async function loadHistory() {
      setLoading(true);
      setError(null);
      setHistory([]);

      try {
        const result = await fetchVesselHistory(mmsi, 100);

        if (active) {
          setHistory(result.positions);
          setCurrentTime(Date.now());
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load vessel history"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [mmsi, validMmsi, refreshKey]);

  // Fetch latest vessel observations
  useEffect(() => {
    if (!validMmsi) return;

    let active = true;

    async function loadLivePosition() {
      try {
        const result = await fetchVessels();

        if (active) {
          const found = result.vessels.find(
            (item) => item.mmsi === mmsi
          );

          setVessel(found ?? null);
          setCurrentTime(Date.now());
        }
      } catch (err) {
        console.error("Unable to refresh live position", err);
      }
    }

    void loadLivePosition();

    const interval = setInterval(() => {
      void loadLivePosition();
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [mmsi, validMmsi]);

  // Filter history by the selected time range
  const filteredHistory = history.filter((position) => {
    const receivedTime = new Date(
      position.received_at
    ).getTime();

    if (!Number.isFinite(receivedTime)) {
      return false;
    }

    if (historyRange === "all") {
      return true;
    }

    const hours = historyRange === "1h" ? 1 : 24;
    const cutoff = currentTime - hours * 60 * 60 * 1000;

    return (
      receivedTime >= cutoff &&
      receivedTime <= currentTime
    );
  });

  // Sort historical positions oldest to newest
  const orderedHistory = [...filteredHistory].sort(
    (a, b) =>
      new Date(a.received_at).getTime() -
      new Date(b.received_at).getTime()
  );

  const latestPosition =
    orderedHistory[orderedHistory.length - 1] ?? null;

  // Calculate average reported speed
  const knownSpeeds = filteredHistory
    .map((position) => position.speed_knots)
    .filter((speed): speed is number => speed !== null);

  const averageSpeed =
    knownSpeeds.length > 0
      ? knownSpeeds.reduce(
          (sum, speed) => sum + speed,
          0
        ) / knownSpeeds.length
      : null;

  // Live vessel might not exist after a server restart
  const displayedVessels = vessel ? [vessel] : [];

  return (
    <main
      style={{
        maxWidth: "1300px",
        margin: "auto",
        padding: "24px",
      }}
    >
      <header style={{ marginBottom: "24px" }}>
        <Link to="/">← Back to Fleet Overview</Link>

        <h1>Vessel Intelligence</h1>

        <p>
          {vessel?.name ?? "Vessel"} — MMSI {mmsiParam}
        </p>

        <p style={{ fontSize: "13px", opacity: 0.75 }}>
          AIS vessel observations and stored position history.
          Historical trails connect sampled observations,
          not verified navigational routes.
        </p>
      </header>

      {!validMmsi ? (
        <p role="alert">Invalid vessel MMSI.</p>
      ) : (
        <>
          {/* Vessel information */}
          <section>
            <h2>Vessel Information</h2>

            <p>
              <strong>MMSI:</strong> {mmsi}
            </p>

            <p>
              <strong>Name:</strong>{" "}
              {vessel?.name ?? "Not available in live feed"}
            </p>

            {vessel ? (
              <>
                <p>
                  <strong>Latest received latitude:</strong>{" "}
                  {vessel.latitude.toFixed(6)}
                </p>

                <p>
                  <strong>Latest received longitude:</strong>{" "}
                  {vessel.longitude.toFixed(6)}
                </p>

                <p>
                  <strong>Speed:</strong>{" "}
                  {vessel.speedKnots ?? "Unknown"} knots
                </p>

                <p>
                  <strong>Freshness:</strong>{" "}
                  <span
                    className={`freshness-badge ${getVesselFreshness(
                      vessel.lastUpdated
                    )}`}
                  >
                    {getVesselFreshness(vessel.lastUpdated)}
                  </span>
                </p>

                <p>
                  <strong>Last received:</strong>{" "}
                  {formatLastReceived(vessel.lastUpdated)}
                </p>
              </>
            ) : (
              <p>
                No current in-memory position available.
                Historical records may still exist.
              </p>
            )}
          </section>

          {/* Historical movement */}
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <h2>Historical Movement</h2>

              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  setRefreshKey((value) => value + 1)
                }
              >
                Refresh History
              </button>
            </div>

            {/* Time range selector */}
            <div style={{ marginBottom: "20px" }}>
              <label htmlFor="history-range">
                <strong>History Time Range: </strong>
              </label>

              <select
                id="history-range"
                value={historyRange}
                onChange={(event) =>
                  setHistoryRange(
                    event.target.value as HistoryRange
                  )
                }
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  marginLeft: "10px",
                }}
              >
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="all">All Loaded History</option>
              </select>
            </div>

            {loading && (
              <p>Loading historical positions...</p>
            )}

            {error && (
              <p role="alert" style={{ color: "#dc2626" }}>
                {error}
              </p>
            )}

            {!loading && !error && (
              <>
                {/* Historical summary */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "16px",
                    marginBottom: "20px",
                  }}
                >
                  <div className="stat-card">
                    <h3>Positions Displayed</h3>
                    <p>{filteredHistory.length}</p>
                  </div>

                  <div className="stat-card">
                    <h3>Average Reported Speed</h3>
                    <p>
                      {averageSpeed !== null
                        ? `${averageSpeed.toFixed(2)} kn`
                        : "N/A"}
                    </p>
                  </div>

                  <div className="stat-card">
                    <h3>Latest Stored Speed</h3>
                    <p>
                      {latestPosition?.speed_knots !== null &&
                      latestPosition?.speed_knots !== undefined
                        ? `${latestPosition.speed_knots} kn`
                        : "N/A"}
                    </p>
                  </div>
                </div>

                <p>
                  Loaded {history.length} stored positions
                  from PostgreSQL (maximum 100).
                </p>

                {latestPosition && (
                  <p>
                    <strong>Latest displayed record:</strong>{" "}
                    {new Date(
                      latestPosition.received_at
                    ).toLocaleString()}
                  </p>
                )}

                {filteredHistory.length === 0 && (
                  <p>
                    No recorded positions found within
                    the selected time range.
                  </p>
                )}
              </>
            )}

            {(vessel || filteredHistory.length > 0) && (
              <VesselMap
                vessels={displayedVessels}
                selectedMmsi={mmsi}
                onSelectVessel={() => {}}
                historyPositions={filteredHistory}
              />
            )}
          </section>

          {/* Historical position table */}
          <section>
            <h2>Recorded Position History</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Received At</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Speed (knots)</th>
                  </tr>
                </thead>

                <tbody>
                  {orderedHistory.map((position) => (
                    <tr key={position.id}>
                      <td>
                        {new Date(
                          position.received_at
                        ).toLocaleString()}
                      </td>

                      <td>
                        {position.latitude.toFixed(6)}
                      </td>

                      <td>
                        {position.longitude.toFixed(6)}
                      </td>

                      <td>
                        {position.speed_knots ?? "Unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {orderedHistory.length === 0 &&
              !loading &&
              !error && (
                <p>No positions to display.</p>
              )}
          </section>
        </>
      )}
    </main>
  );
}
