
import { useEffect, useMemo } from "react";
import { divIcon } from "leaflet";

import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";

import type {
  Vessel,
  VesselPosition,
} from "../services/vesselApi";

import {
  getVesselFreshness,
  formatLastReceived,
} from "../utils/vesselFreshness";

import "leaflet/dist/leaflet.css";

interface VesselMapProps {
  vessels: Vessel[];
  selectedMmsi: number | null;
  onSelectVessel: (mmsi: number) => void;
  historyPositions: VesselPosition[];
  center?: [number, number];
}

// Status colors
const COLORS = {
  recent: "#16a34a",
  aging: "#f59e0b",
  stale: "#dc2626",
  unknown: "#64748b",
};

// A simple ship-shaped SVG.
// Used for both map markers and the legend.
function shipSvg(color: string, size = 24): string {
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${size}"
      height="${size}"
      viewBox="0 0 24 24"
      fill="none"
      stroke="${color}"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 10.189V14"/>
      <path d="M12 2v3"/>
      <path d="M19 13.5V9a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4.5"/>
      <path d="M3.5 17 2 15l10-4 10 4-1.5 2"/>
      <path d="M2 20c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/>
    </svg>
  `;
}

// Create Leaflet ship marker icon.
function createShipIcon(color: string, selected = false) {
  return divIcon({
    className: "portpower-ship-marker",

    html: `
      <div
        style="
          width: 34px;
          height: 34px;
          display: flex;
          justify-content: center;
          align-items: center;
          background: white;
          border: 2px solid ${selected ? "#0284c7" : color};
          border-radius: 50%;
          box-shadow: 0 2px 7px rgba(0,0,0,0.22);
        "
      >
        ${shipSvg(color, 23)}
      </div>
    `,

    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
}

// Reuse icons instead of rebuilding them
// for every vessel on every render.
const SHIP_ICONS = {
  recent: createShipIcon(COLORS.recent),
  aging: createShipIcon(COLORS.aging),
  stale: createShipIcon(COLORS.stale),
  unknown: createShipIcon(COLORS.unknown),
};

const SELECTED_ICONS = {
  recent: createShipIcon(COLORS.recent, true),
  aging: createShipIcon(COLORS.aging, true),
  stale: createShipIcon(COLORS.stale, true),
  unknown: createShipIcon(COLORS.unknown, true),
};

function getShipIcon(
  lastUpdated: string,
  selected: boolean
) {
  const freshness = getVesselFreshness(lastUpdated);

  return selected
    ? SELECTED_ICONS[freshness]
    : SHIP_ICONS[freshness];
}

// Focus on a selected vessel.
function MapFocus({
  vessel,
}: {
  vessel: Vessel | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!vessel) return;

    map.flyTo(
      [vessel.latitude, vessel.longitude],
      Math.max(map.getZoom(), 13),
      { duration: 1 }
    );
  }, [vessel?.mmsi, map]);

  return null;
}

// Focus on historical movement if
// the vessel is not in the live feed.
function HistoryFocus({
  vessel,
  coordinates,
}: {
  vessel: Vessel | null;
  coordinates: [number, number][];
}) {
  const map = useMap();

  const historyKey = coordinates
    .map(([lat, lon]) => `${lat},${lon}`)
    .join(";");

  useEffect(() => {
    if (vessel || coordinates.length === 0) return;

    if (coordinates.length === 1) {
      map.setView(coordinates[0], 13);
    } else {
      map.fitBounds(coordinates, {
        padding: [35, 35],
        maxZoom: 14,
      });
    }
  }, [vessel?.mmsi, historyKey, map]);

  return null;
}

// Small legend item using a ship icon.
function LegendShip({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 10.189V14" />
        <path d="M12 2v3" />
        <path d="M19 13.5V9a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4.5" />
        <path d="M3.5 17 2 15l10-4 10 4-1.5 2" />
        <path d="M2 20c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
      </svg>

      <span>{label}</span>
    </span>
  );
}

export default function VesselMap({
  vessels,
  selectedMmsi,
  onSelectVessel,
  historyPositions,
  center = [30.3625, -89.09],
}: VesselMapProps) {
  const selectedVessel =
    vessels.find((vessel) => vessel.mmsi === selectedMmsi) ??
    null;

  // PostgreSQL history comes newest first.
  // Convert to chronological order.
  const orderedHistory = useMemo(
    () =>
      [...historyPositions].sort(
        (a, b) =>
          new Date(a.received_at).getTime() -
          new Date(b.received_at).getTime()
      ),
    [historyPositions]
  );

  const historyCoordinates = useMemo(
    (): [number, number][] =>
      orderedHistory.map((position) => [
        position.latitude,
        position.longitude,
      ]),
    [orderedHistory]
  );

  return (
    <div>
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        style={{
          height: "min(72vh, 760px)",
          minHeight: "420px",
          width: "100%",
          borderRadius: "12px",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapFocus vessel={selectedVessel} />

        <HistoryFocus
          vessel={selectedVessel}
          coordinates={historyCoordinates}
        />

        {/* Historical vessel trail */}
        {historyCoordinates.length >= 2 && (
          <Polyline
            positions={historyCoordinates}
            pathOptions={{
              color: "#7c3aed",
              weight: 3,
              opacity: 0.8,
              dashArray: "8, 6",
            }}
          />
        )}

        {/* Historical observations */}
        {orderedHistory.map((position) => (
          <CircleMarker
            key={`history-${position.id}`}
            center={[
              position.latitude,
              position.longitude,
            ]}
            radius={4}
            pathOptions={{
              color: "#7c3aed",
              fillColor: "#c4b5fd",
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <strong>Historical Position</strong>

              <p>
                Received:{" "}
                {new Date(
                  position.received_at
                ).toLocaleString()}
              </p>

              <p>
                Speed:{" "}
                {position.speed_knots ?? "Unknown"} knots
              </p>
            </Popup>
          </CircleMarker>
        ))}

        {/* Ship-shaped vessel markers */}
        {vessels.map((vessel) => {
          const isSelected =
            vessel.mmsi === selectedMmsi;

          const freshness = getVesselFreshness(
            vessel.lastUpdated
          );

          const markerColor = COLORS[freshness];

          return (
            <Marker
              key={vessel.mmsi}
              position={[
                vessel.latitude,
                vessel.longitude,
              ]}
              icon={getShipIcon(
                vessel.lastUpdated,
                isSelected
              )}
            >
              <Popup minWidth={210}>
                <div
                  style={{
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 10px",
                      fontSize: "16px",
                    }}
                  >
                    {vessel.name}
                  </h3>

                  <p style={{ margin: "5px 0" }}>
                    <strong>MMSI:</strong>{" "}
                    {vessel.mmsi}
                  </p>

                  <p style={{ margin: "5px 0" }}>
                    <strong>Speed:</strong>{" "}
                    {vessel.speedKnots === null
                      ? "Unknown"
                      : `${vessel.speedKnots} knots`}
                  </p>

                  <p style={{ margin: "5px 0" }}>
                    <strong>Status:</strong>{" "}
                    <span
                      style={{
                        color: markerColor,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {freshness}
                    </span>
                  </p>

                  <p style={{ margin: "5px 0" }}>
                    <strong>Last received:</strong>{" "}
                    {formatLastReceived(
                      vessel.lastUpdated
                    )}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      onSelectVessel(vessel.mmsi)
                    }
                    style={{
                      marginTop: "12px",
                      width: "100%",
                      padding: "9px 12px",
                      background: "#0284c7",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    View Details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Minimal map legend */}
      <div
        style={{
          display: "flex",
          gap: "18px",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "12px 4px",
          fontSize: "12px",
          color: "#64748b",
        }}
      >
        <LegendShip
          color={COLORS.recent}
          label="Recent (0–2 min)"
        />

        <LegendShip
          color={COLORS.aging}
          label="Aging (2–10 min)"
        />

        <LegendShip
          color={COLORS.stale}
          label="Stale (10+ min)"
        />

        <LegendShip
          color={COLORS.unknown}
          label="Unknown"
        />

        {historyPositions.length > 0 && (
          <span>🟣 Historical trail</span>
        )}
      </div>
    </div>
  );
}
