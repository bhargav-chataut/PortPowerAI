
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  getEquipment,
  createEquipment,
  updateEquipmentStatus,
  type Equipment,
  type EquipmentType,
  type EquipmentStatus,
  type EnergyType,
} from "../services/equipmentApi";

import type { PortCode } from "../services/authApi";

import "./EquipmentManagementPage.css";

interface Props {
  port: PortCode;
}

const EQUIPMENT_TYPES: {
  value: EquipmentType;
  label: string;
}[] = [
  { value: "forklift", label: "Forklift" },
  { value: "reach_stacker", label: "Reach Stacker" },
  { value: "mobile_crane", label: "Mobile Crane" },
  { value: "gantry_crane", label: "Gantry Crane" },
  { value: "terminal_tractor", label: "Terminal Tractor" },
];

const STATUSES: {
  value: EquipmentStatus;
  label: string;
}[] = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In Use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of Service" },
];

const STATUS_LABELS: Record<
  EquipmentStatus,
  string
> = {
  available: "Available",
  in_use: "In Use",
  maintenance: "Maintenance",
  out_of_service: "Out of Service",
};

function getTypeLabel(type: EquipmentType) {
  return (
    EQUIPMENT_TYPES.find((item) => item.value === type)
      ?.label ?? type
  );
}

export default function EquipmentManagementPage({
  port,
}: Props) {
  const portName =
    port === "gulfport"
      ? "Port of Gulfport"
      : "PortMiami";

  const [equipment, setEquipment] = useState<
    Equipment[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [updatingId, setUpdatingId] = useState<
    string | null
  >(null);

  const [error, setError] = useState<string | null>(
    null
  );

  const [success, setSuccess] = useState<
    string | null
  >(null);

  const [search, setSearch] = useState("");

  const [code, setCode] = useState("");
  const [type, setType] = useState<EquipmentType>(
    "forklift"
  );
  const [capacity, setCapacity] = useState("");
  const [energyType, setEnergyType] =
    useState<EnergyType>("diesel");

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    getEquipment(controller.signal)
      .then(setEquipment)
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load equipment"
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

  async function handleAddEquipment(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError(null);
    setSuccess(null);

    const equipmentCode = code.trim().toUpperCase();

    if (!equipmentCode || equipmentCode.length > 40) {
      setError("Enter a valid equipment code.");
      return;
    }

    const numericCapacity =
      capacity.trim() === "" ? null : Number(capacity);

    if (
      numericCapacity !== null &&
      (!Number.isFinite(numericCapacity) ||
        numericCapacity <= 0)
    ) {
      setError("Capacity must be greater than zero.");
      return;
    }

    setSaving(true);

    try {
      const created = await createEquipment({
        equipment_code: equipmentCode,
        equipment_type: type,
        capacity_tonnes: numericCapacity,
        energy_type: energyType,
      });

      setEquipment((previous) =>
        [...previous, created].sort((a, b) =>
          a.equipment_code.localeCompare(b.equipment_code)
        )
      );

      setCode("");
      setCapacity("");

      setSuccess(
        `${created.equipment_code} added successfully.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to register equipment"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(
    item: Equipment,
    status: EquipmentStatus
  ) {
    if (item.status === status) return;

    setError(null);
    setSuccess(null);

    const itemId = String(item.id);
    setUpdatingId(itemId);

    try {
      const updated = await updateEquipmentStatus(
        item.id,
        status
      );

      setEquipment((previous) =>
        previous.map((existing) =>
          String(existing.id) === itemId
            ? updated
            : existing
        )
      );

      setSuccess(
        `${updated.equipment_code} updated successfully.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update equipment"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const total = equipment.length;

  const available = equipment.filter(
    (item) => item.status === "available"
  ).length;

  const inUse = equipment.filter(
    (item) => item.status === "in_use"
  ).length;

  const unavailable = total - available - inUse;

  const filteredEquipment = equipment.filter(
    (item) =>
      item.equipment_code
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      getTypeLabel(item.equipment_type)
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <main className="equipment-page">
      <header className="equipment-header">
        <div>
          <Link
            className="equipment-back"
            to={`/${port}`}
          >
            ← Back to map
          </Link>

          <h1>Equipment Management</h1>

          <p>
            {portName} · Daily Operations
          </p>
        </div>

        <div className="equipment-header-label">
          PortPower AI
        </div>
      </header>

      <section
        className="equipment-stats"
        aria-label="Equipment summary"
      >
        <div className="equipment-stat">
          <span>Total Equipment</span>
          <strong>{total}</strong>
        </div>

        <div className="equipment-stat">
          <span>Available</span>
          <strong>{available}</strong>
        </div>

        <div className="equipment-stat">
          <span>In Use</span>
          <strong>{inUse}</strong>
        </div>

        <div className="equipment-stat">
          <span>Unavailable</span>
          <strong>{unavailable}</strong>
        </div>
      </section>

      {error && (
        <div className="equipment-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="equipment-success" role="status">
          {success}
        </div>
      )}

      <div className="equipment-layout">
        {/* Registration form */}
        <section className="equipment-card">
          <div className="equipment-section-heading">
            <h2>Register Equipment</h2>
            <p>
              Add a machine to your port inventory.
            </p>
          </div>

          <form
            onSubmit={handleAddEquipment}
            className="equipment-form"
          >
            <label htmlFor="equipment-code">
              Equipment Code
            </label>

            <input
              id="equipment-code"
              value={code}
              onChange={(event) =>
                setCode(event.target.value)
              }
              maxLength={40}
              placeholder="e.g. FL-002"
              required
            />

            <label htmlFor="equipment-type">
              Equipment Type
            </label>

            <select
              id="equipment-type"
              value={type}
              onChange={(event) =>
                setType(
                  event.target.value as EquipmentType
                )
              }
            >
              {EQUIPMENT_TYPES.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>

            <label htmlFor="equipment-capacity">
              Rated Capacity (tonnes)
            </label>

            <input
              id="equipment-capacity"
              type="number"
              min="0.01"
              step="0.01"
              value={capacity}
              onChange={(event) =>
                setCapacity(event.target.value)
              }
              placeholder="e.g. 5"
            />

            <small>
              Optional. Leave blank if not applicable.
            </small>

            <label htmlFor="equipment-energy">
              Energy Source
            </label>

            <select
              id="equipment-energy"
              value={energyType}
              onChange={(event) =>
                setEnergyType(
                  event.target.value as EnergyType
                )
              }
            >
              <option value="diesel">Diesel</option>
              <option value="electric">Electric</option>
              <option value="hybrid">Hybrid</option>
            </select>

            <button
              type="submit"
              className="equipment-primary-button"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "+ Add Equipment"}
            </button>
          </form>
        </section>

        {/* Inventory list */}
        <section className="equipment-card equipment-inventory">
          <div className="equipment-list-header">
            <div className="equipment-section-heading">
              <h2>Equipment Inventory</h2>
              <p>
                Manage availability for daily planning.
              </p>
            </div>

            <input
              className="equipment-search"
              type="search"
              aria-label="Search equipment"
              placeholder="Search equipment..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          {loading ? (
            <p className="equipment-empty">
              Loading equipment...
            </p>
          ) : filteredEquipment.length === 0 ? (
            <div className="equipment-empty">
              <strong>
                {search
                  ? "No matching equipment"
                  : "No equipment registered"}
              </strong>

              <p>
                {search
                  ? "Try another equipment code or type."
                  : "Use the form to register your first machine."}
              </p>
            </div>
          ) : (
            <div className="equipment-table-wrap">
              <table className="equipment-table">
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Capacity</th>
                    <th>Energy</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredEquipment.map((item) => (
                    <tr key={String(item.id)}>
                      <td>
                        <strong>
                          {item.equipment_code}
                        </strong>

                        <span className="equipment-type">
                          {getTypeLabel(
                            item.equipment_type
                          )}
                        </span>
                      </td>

                      <td>
                        {item.capacity_tonnes === null
                          ? "—"
                          : `${item.capacity_tonnes} t`}
                      </td>

                      <td className="equipment-capitalize">
                        {item.energy_type ?? "—"}
                      </td>

                      <td>
                        <span
                          className={`equipment-status equipment-status-${item.status}`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>

                        <select
                          className="equipment-status-select"
                          aria-label={`Change status for ${item.equipment_code}`}
                          value={item.status}
                          disabled={
                            updatingId ===
                            String(item.id)
                          }
                          onChange={(event) =>
                            void handleStatusChange(
                              item,
                              event.target
                                .value as EquipmentStatus
                            )
                          }
                        >
                          {STATUSES.map((status) => (
                            <option
                              key={status.value}
                              value={status.value}
                            >
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="equipment-footer">
        Inventory is saved for your assigned port.
        Equipment availability will be used by the
        scheduling optimizer.
      </p>
    </main>
  );
}
