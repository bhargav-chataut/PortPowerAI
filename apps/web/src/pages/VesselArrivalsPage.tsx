
import {
    useEffect,
    useState,
    type CSSProperties,
    type FormEvent,
  } from "react";
  import { Link } from "react-router-dom";
  
  import {
    getArrivals,
    getArrivalBerths,
    createArrival,
    type Arrival,
    type Berth,
    type CargoType,
  } from "../services/arrivalApi";
  
  import type { PortCode } from "../services/authApi";
  
  interface Props {
    port: PortCode;
  }
  
  const cargoTypes: {
    value: CargoType;
    label: string;
  }[] = [
    { value: "containers", label: "Containers" },
    { value: "general", label: "General cargo" },
    { value: "bulk", label: "Bulk cargo" },
    { value: "roro", label: "Ro-Ro" },
  ];
  
  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#fff",
    color: "#0f172a",
    font: "inherit",
    fontSize: "14px",
  };
  
  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "7px",
  };
  
  const cardStyle: CSSProperties = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "24px",
    minWidth: 0,
  };
  
  function formatDate(value: string) {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  
  export default function VesselArrivalsPage({
    port,
  }: Props) {
    const portName =
      port === "gulfport"
        ? "Port of Gulfport"
        : "PortMiami";
  
    const [arrivals, setArrivals] = useState<Arrival[]>([]);
    const [berths, setBerths] = useState<Berth[]>([]);
  
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(
      null
    );
  
    const [mmsi, setMmsi] = useState("");
    const [name, setName] = useState("");
    const [eta, setEta] = useState("");
    const [cargoType, setCargoType] =
      useState<CargoType>("containers");
    const [workload, setWorkload] = useState("");
    const [serviceHours, setServiceHours] = useState("");
    const [preferredBerth, setPreferredBerth] =
      useState("");
    const [notes, setNotes] = useState("");
  
    useEffect(() => {
      const controller = new AbortController();
  
      setLoading(true);
      setError(null);
  
      Promise.all([
        getArrivals(controller.signal),
        getArrivalBerths(controller.signal),
      ])
        .then(([savedArrivals, savedBerths]) => {
          if (controller.signal.aborted) return;
  
          setArrivals(savedArrivals);
          setBerths(savedBerths);
        })
        .catch((err) => {
          if (!controller.signal.aborted) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to load arrivals"
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
  
      return () => controller.abort();
    }, [port]);
  
    async function handleSubmit(
      event: FormEvent<HTMLFormElement>
    ) {
      event.preventDefault();
      setError(null);
      setSuccess(null);
  
      if (!/^\d{9}$/.test(mmsi.trim())) {
        setError("MMSI must contain exactly 9 digits.");
        return;
      }
  
      // datetime-local produces local time.
      // Convert it to an unambiguous UTC timestamp.
      const etaDate = new Date(eta);
  
      if (
        !eta ||
        !Number.isFinite(etaDate.getTime())
      ) {
        setError("Enter a valid expected arrival time.");
        return;
      }
  
      const quantity = Number(workload);
  
      if (
        !workload.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        setError("Cargo workload must be positive.");
        return;
      }
  
      const duration =
        serviceHours.trim() === ""
          ? null
          : Number(serviceHours);
  
      if (
        duration !== null &&
        (!Number.isFinite(duration) ||
          duration <= 0)
      ) {
        setError("Service hours must be positive.");
        return;
      }
  
      setSaving(true);
  
      try {
        const created = await createArrival({
          mmsi: mmsi.trim(),
          vessel_name: name.trim() || null,
          planned_eta: etaDate.toISOString(),
          cargo_type: cargoType,
          workload_quantity: quantity,
          estimated_service_hours: duration,
          preferred_berth_id:
            preferredBerth || null,
          notes: notes.trim() || null,
        });
  
        setArrivals((previous) =>
          [...previous, created].sort(
            (a, b) =>
              new Date(a.planned_eta).getTime() -
              new Date(b.planned_eta).getTime()
          )
        );
  
        setMmsi("");
        setName("");
        setEta("");
        setWorkload("");
        setServiceHours("");
        setPreferredBerth("");
        setNotes("");
  
        setSuccess("Vessel arrival saved successfully.");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to save vessel arrival"
        );
      } finally {
        setSaving(false);
      }
    }
  
    const workloadUnit =
      cargoType === "containers"
        ? "Container moves"
        : cargoType === "roro"
          ? "Vehicle moves"
          : "Tonnes";
  
    const field = (
      id: string,
      label: string,
      control: React.ReactNode
    ) => (
      <div>
        <label htmlFor={id} style={labelStyle}>
          {label}
        </label>
        {control}
      </div>
    );
  
    return (
      <main
        className="pp-arrivals-page"
        style={{
          maxWidth: "1440px",
          margin: "0 auto",
          padding: "28px 24px",
          color: "#0f172a",
        }}
      >
        <header style={{ marginBottom: "26px" }}>
          <Link
            to={`/${port}`}
            className="pp-arrivals-back"
            style={{
              color: "#0369a1",
              fontSize: "13px",
              textDecoration: "none",
            }}
          >
            ← Back to map
          </Link>
  
          <h1
            style={{
              margin: "14px 0 5px",
              fontSize: "28px",
            }}
          >
            Vessel Arrivals
          </h1>
  
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "14px",
            }}
          >
            {portName} · Daily Operations
          </p>
        </header>
  
        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "24px",
          }}
        >
          <div className="pp-arrivals-stat" style={{ ...cardStyle, flex: "1 1 160px" }}>
            <p style={{ color: "#64748b", margin: 0 }}>
              Registered Arrivals
            </p>
            <strong style={{ fontSize: "28px" }}>
              {arrivals.length}
            </strong>
          </div>
  
          <div className="pp-arrivals-stat" style={{ ...cardStyle, flex: "1 1 160px" }}>
            <p style={{ color: "#64748b", margin: 0 }}>
              Berths
            </p>
            <strong style={{ fontSize: "28px" }}>
              {berths.length}
            </strong>
          </div>
        </div>
  
        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
  
        {success && (
          <p role="status" style={{ color: "#15803d" }}>
            {success}
          </p>
        )}
  
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
            gap: "20px",
            alignItems: "start",
          }}
        >
          <section className="pp-arrivals-card" style={cardStyle}>
            <h2 style={{ fontSize: "18px", marginTop: 0 }}>
              Register Expected Arrival
            </h2>
  
            <p
              style={{
                color: "#64748b",
                fontSize: "13px",
                marginBottom: "24px",
              }}
            >
              Add the vessel's planned arrival and cargo
              workload.
            </p>
  
            <form
              onSubmit={handleSubmit}
              style={{
                display: "grid",
                gap: "16px",
              }}
            >
              {field(
                "arrival-mmsi",
                "MMSI *",
                <input
                  id="arrival-mmsi"
                  style={inputStyle}
                  value={mmsi}
                  onChange={(e) =>
                    setMmsi(e.target.value)
                  }
                  maxLength={9}
                  inputMode="numeric"
                  placeholder="9-digit MMSI"
                  required
                />
              )}
  
              {field(
                "arrival-name",
                "Vessel Name",
                <input
                  id="arrival-name"
                  style={inputStyle}
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                  maxLength={150}
                  placeholder="Optional"
                />
              )}
  
              {field(
                "arrival-eta",
                "Planned ETA *",
                <input
                  id="arrival-eta"
                  type="datetime-local"
                  style={inputStyle}
                  value={eta}
                  onChange={(e) =>
                    setEta(e.target.value)
                  }
                  required
                />
              )}
  
              {field(
                "arrival-cargo",
                "Cargo Type *",
                <select
                  id="arrival-cargo"
                  style={inputStyle}
                  value={cargoType}
                  onChange={(e) =>
                    setCargoType(
                      e.target.value as CargoType
                    )
                  }
                >
                  {cargoTypes.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>
              )}
  
              {field(
                "arrival-workload",
                `${workloadUnit} *`,
                <input
                  id="arrival-workload"
                  type="number"
                  min="0.01"
                  step="any"
                  style={inputStyle}
                  value={workload}
                  onChange={(e) =>
                    setWorkload(e.target.value)
                  }
                  placeholder="Estimated workload"
                  required
                />
              )}
  
              {field(
                "arrival-hours",
                "Estimated Service Hours",
                <input
                  id="arrival-hours"
                  type="number"
                  min="0.01"
                  step="any"
                  style={inputStyle}
                  value={serviceHours}
                  onChange={(e) =>
                    setServiceHours(e.target.value)
                  }
                  placeholder="Optional"
                />
              )}
  
              {field(
                "arrival-berth",
                "Preferred Berth",
                <select
                  id="arrival-berth"
                  style={inputStyle}
                  value={preferredBerth}
                  onChange={(e) =>
                    setPreferredBerth(e.target.value)
                  }
                >
                  <option value="">
                    No preference
                  </option>
  
                  {berths.map((berth) => (
                    <option
                      key={String(berth.id)}
                      value={String(berth.id)}
                    >
                      {berth.name} ({berth.status})
                    </option>
                  ))}
                </select>
              )}
  
              {field(
                "arrival-notes",
                "Notes",
                <textarea
                  id="arrival-notes"
                  style={{
                    ...inputStyle,
                    minHeight: "75px",
                    resize: "vertical",
                  }}
                  value={notes}
                  onChange={(e) =>
                    setNotes(e.target.value)
                  }
                  maxLength={2000}
                  placeholder="Optional instructions or context"
                />
              )}
  
              <button
                type="submit"
                disabled={saving || loading}
                style={{
                  padding: "12px",
                  background: "#0f2747",
                  color: "#fff",
                  border: 0,
                  borderRadius: "8px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving
                  ? "Saving..."
                  : "Save Vessel Arrival"}
              </button>
            </form>
          </section>
  
          <section className="pp-arrivals-card" style={cardStyle}>
            <h2 style={{ fontSize: "18px", marginTop: 0 }}>
              Arrival Schedule
            </h2>
  
            <p
              style={{
                color: "#64748b",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              Planned arrivals saved in PostgreSQL.
            </p>
  
            {loading ? (
              <p>Loading arrivals...</p>
            ) : arrivals.length === 0 ? (
              <p
                style={{
                  color: "#64748b",
                  padding: "24px 0",
                }}
              >
                No vessel arrivals registered yet.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "13px",
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Vessel",
                        "ETA",
                        "Cargo",
                        "Berth",
                        "Status",
                      ].map((heading) => (
                        <th
                          key={heading}
                          style={{
                            padding: "12px 10px",
                            color: "#64748b",
                            borderBottom:
                              "1px solid #e2e8f0",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
  
                  <tbody>
                    {arrivals.map((arrival) => {
                      const berth = berths.find(
                        (item) =>
                          String(item.id) ===
                          String(
                            arrival.preferred_berth_id
                          )
                      );
  
                      return (
                        <tr key={String(arrival.id)}>
                          <td
                            style={{
                              padding: "14px 10px",
                              borderBottom:
                                "1px solid #f1f5f9",
                            }}
                          >
                            <strong>
                              {arrival.vessel_name ||
                                "Unnamed vessel"}
                            </strong>
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "12px",
                              }}
                            >
                              {arrival.mmsi}
                            </div>
                          </td>
  
                          <td
                            style={{
                              padding: "14px 10px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatDate(
                              arrival.planned_eta
                            )}
                          </td>
  
                          <td style={{ padding: "14px 10px" }}>
                            {arrival.cargo_type}
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: "12px",
                              }}
                            >
                              {arrival.workload_quantity}{" "}
                              {arrival.workload_unit}
                            </div>
                          </td>
  
                          <td style={{ padding: "14px 10px" }}>
                            {berth?.name || "Unassigned"}
                          </td>
  
                          <td
                            style={{
                              padding: "14px 10px",
                              textTransform: "capitalize",
                            }}
                          >
                            {arrival.status.replaceAll(
                              "_",
                              " "
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
  
        <p
          style={{
            fontSize: "12px",
            color: "#64748b",
            marginTop: "24px",
          }}
        >
          Arrivals are manager-entered plans, not
          confirmed AIS predictions.
        </p>
      </main>
    );
  }
  