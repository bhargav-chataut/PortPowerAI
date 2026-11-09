
import { useEffect, useState } from "react";
import VesselMap from "./components/VesselMap";

import {
  getVesselFreshness,
  formatLastReceived,
} from "./utils/vesselFreshness";

import {
  fetchVessels,
  fetchVesselHistory,
  type Vessel,
  type VesselPosition,
} from "./services/vesselApi";

function App() {
  // Live vessel data
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and vessel selection
  const [search, setSearch] = useState("");
  const [selectedMmsi, setSelectedMmsi] = useState<number | null>(null);

  // Historical vessel positions
  const [historyData, setHistoryData] = useState<{
    mmsi: number;
    positions: VesselPosition[];
  } | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Refresh relative timestamps
  const [, setClockTick] = useState(0);

  // Fetch live vessel positions every 5 seconds
  useEffect(() => {
    let active = true;
    let requestInProgress = false;

    async function loadVessels() {
      if (requestInProgress) return;

      requestInProgress = true;

      try {
        const result = await fetchVessels();

        if (active) {
          setVessels(result.vessels);
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

    const clockInterval = setInterval(() => {
      setClockTick((previous) => previous + 1);
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  // Fetch history whenever a different vessel is selected
  useEffect(() => {
    if (selectedMmsi === null) {
      return;
    }

    let active = true;
    const mmsi = selectedMmsi;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const result = await fetchVesselHistory(mmsi, 100);

        if (active) {
          setHistoryData({
            mmsi: result.mmsi,
            positions: result.positions,
          });
        }
      } catch (err) {
        if (active) {
          setHistoryError(
            err instanceof Error
              ? err.message
              : "Unable to load vessel history"
          );
        }
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, [selectedMmsi]);

  // Search vessels by name or MMSI
  const filteredVessels = vessels.filter((vessel) => {
    const query = search.trim().toLowerCase();

    return (
      vessel.name.toLowerCase().includes(query) ||
      vessel.mmsi.toString().includes(query)
    );
  });

  // Get currently selected vessel
  const selectedVessel =
    vessels.find((vessel) => vessel.mmsi === selectedMmsi) ?? null;

  // Only display history belonging to the selected vessel
  const historyPositions =
    !historyError &&
    historyData?.mmsi === selectedMmsi
      ? historyData.positions
      : [];

  return (
    <main
      style={{
        padding: "24px",
        maxWidth: "1400px",
        margin: "auto",
      }}
    >
      <header style={{ marginBottom: "28px" }}>
        <h1>PortPower AI</h1>

        <p>
          Live Vessel Monitoring Dashboard —Gulf Port
        </p>

        <p style={{ fontSize: "13px", opacity: 0.75 }}>
          AIS vessel positions are live feed observations.
          Port operating schedules will be simulated.
          Freshness indicates when our backend last received
          a position, not guaranteed vessel location accuracy.
        </p>
      </header>

      {loading && <p>Loading vessel data...</p>}

      {error && (
        <p role="alert" style={{ color: "#dc2626" }}>
          Error: {error}
        </p>
      )}

      {!loading && (
        <>
          {/* Vessel overview */}
          <section>
            <h2>Vessel Overview</h2>

            <p>
              <strong>Tracked vessels:</strong> {vessels.length}
            </p>

            <input
              type="search"
              placeholder="Search vessel name or MMSI..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{
                padding: "12px",
                width: "100%",
                maxWidth: "450px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "15px",
                marginTop: "12px",
              }}
            />

            <p style={{ marginTop: "12px" }}>
              Showing {filteredVessels.length} of {vessels.length} vessels
            </p>
          </section>

          {/* Vessel map */}
          <section>
            <h2>Live Vessel Map</h2>

            {filteredVessels.length > 0 ? (
              <VesselMap
                vessels={filteredVessels}
                selectedMmsi={selectedMmsi}
                onSelectVessel={setSelectedMmsi}
                historyPositions={historyPositions}
              />
            ) : (
              <p>
                {search
                  ? "No vessels match your search."
                  : "Waiting for AIS vessel positions..."}
              </p>
            )}
          </section>

          {/* Selected vessel */}
          {selectedVessel && (
            <section>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <h2>Selected Vessel</h2>

                <button
                  type="button"
                  onClick={() => setSelectedMmsi(null)}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  Clear Selection
                </button>
              </div>

              <p>
                <strong>Name:</strong> {selectedVessel.name}
              </p>

              <p>
                <strong>MMSI:</strong> {selectedVessel.mmsi}
              </p>

              <p>
                <strong>Latitude:</strong>{" "}
                {selectedVessel.latitude.toFixed(6)}
              </p>

              <p>
                <strong>Longitude:</strong>{" "}
                {selectedVessel.longitude.toFixed(6)}
              </p>

              <p>
                <strong>Speed:</strong>{" "}
                {selectedVessel.speedKnots ?? "Unknown"} knots
              </p>

              <p>
                <strong>Position Freshness:</strong>{" "}
                <span
                  className={`freshness-badge ${getVesselFreshness(
                    selectedVessel.lastUpdated
                  )}`}
                >
                  {getVesselFreshness(selectedVessel.lastUpdated)}
                </span>
              </p>

              <p>
                <strong>Last Received:</strong>{" "}
                {new Date(
                  selectedVessel.lastUpdated
                ).toLocaleString()}{" "}
                ({formatLastReceived(selectedVessel.lastUpdated)})
              </p>

              {/* Historical vessel data */}
              <h3>Historical Movement</h3>

              {historyLoading && (
                <p>Loading historical positions...</p>
              )}

              {historyError && (
                <p role="alert" style={{ color: "#dc2626" }}>
                  Error: {historyError}
                </p>
              )}

              {!historyLoading && !historyError && (
                <>
                  <p>
                    <strong>Recorded positions:</strong>{" "}
                    {historyPositions.length}
                  </p>

                  {historyPositions.length >= 2 ? (
                    <p>
                      A purple dashed trail shows the recorded
                      positions on the map.
                    </p>
                  ) : (
                    <p>
                      At least two stored positions are needed
                      to draw a movement trail.
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          {/* Vessel table */}
          <section>
            <h2>Vessel Details</h2>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
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
                  </tr>
                </thead>

                <tbody>
                  {filteredVessels.map((vessel) => (
                    <tr
                      key={vessel.mmsi}
                      onClick={() => setSelectedMmsi(vessel.mmsi)}
                      style={{
                        cursor: "pointer",
                        background:
                          selectedMmsi === vessel.mmsi
                            ? "rgba(2, 132, 199, 0.15)"
                            : undefined,
                      }}
                    >
                      <td>{vessel.name}</td>
                      <td>{vessel.mmsi}</td>
                      <td>{vessel.latitude.toFixed(4)}</td>
                      <td>{vessel.longitude.toFixed(4)}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredVessels.length === 0 && (
              <p style={{ marginTop: "16px" }}>
                No vessels to display.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default App;
