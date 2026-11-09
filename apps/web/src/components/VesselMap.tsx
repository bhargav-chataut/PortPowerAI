
import { useEffect } from "react";

import {
  MapContainer,
  TileLayer,
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

  // Allows Gulfport and Miami to use different locations
  center?: [number, number];
}

// Determine marker color from position freshness
function getMarkerColor(lastUpdated: string): string {
  const freshness = getVesselFreshness(lastUpdated);

  switch (freshness) {
    case "recent":
      return "#16a34a";
    case "aging":
      return "#f59e0b";
    case "stale":
      return "#dc2626";
    default:
      return "#64748b";
  }
}

// Focus map when a different vessel is selected
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

// Fit historical observations when the vessel is
// absent from the currently received AIS feed.
function HistoryFocus({
  vessel,
  coordinates,
}: {
  vessel: Vessel | null;
  coordinates: [number, number][];
}) {
  const map = useMap();

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
  }, [vessel?.mmsi, coordinates.length, map]);

  return null;
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

  // Sort historical observations from oldest to newest.
  const orderedHistory = [...historyPositions].sort(
    (a, b) =>
      new Date(a.received_at).getTime() -
      new Date(b.received_at).getTime()
  );

  const historyCoordinates: [number, number][] =
    orderedHistory.map((position) => [
      position.latitude,
      position.longitude,
    ]);

  return (
    <div>
      <MapContainer
        center={center}
        zoom={11}
        scrollWheelZoom
        style={{
          height: "500px",
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

        {/* Historical movement trail */}
        {historyCoordinates.length >= 2 && (
          <Polyline
            positions={historyCoordinates}
            pathOptions={{
              color: "#7c3aed",
              weight: 4,
              opacity: 0.85,
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
              fillOpacity: 0.9,
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

        {/* Latest AIS vessel positions */}
        {vessels.map((vessel) => {
          const isSelected =
            vessel.mmsi === selectedMmsi;

          const markerColor = getMarkerColor(
            vessel.lastUpdated
          );

          const freshness = getVesselFreshness(
            vessel.lastUpdated
          );

          return (
            <CircleMarker
              key={vessel.mmsi}
              center={[
                vessel.latitude,
                vessel.longitude,
              ]}
              radius={isSelected ? 10 : 6}
              pathOptions={{
                color: isSelected
                  ? "#0284c7"
                  : markerColor,
                fillColor: markerColor,
                fillOpacity: 0.85,
                weight: isSelected ? 3 : 1,
              }}
              eventHandlers={{
                click: () =>
                  onSelectVessel(vessel.mmsi),
              }}
            >
              <Popup>
                <strong>{vessel.name}</strong>

                <p>MMSI: {vessel.mmsi}</p>

                <p>
                  Speed:{" "}
                  {vessel.speedKnots ?? "Unknown"} knots
                </p>

                <p>
                  Freshness:{" "}
                  <strong
                    style={{
                      color: markerColor,
                      textTransform: "capitalize",
                    }}
                  >
                    {freshness}
                  </strong>
                </p>

                <p>
                  Last received:{" "}
                  {formatLastReceived(
                    vessel.lastUpdated
                  )}
                </p>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Map legend */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          flexWrap: "wrap",
          padding: "14px 0",
          fontSize: "13px",
        }}
      >
        <span>🟢 Recent (0–2 min)</span>
        <span>🟠 Aging (2–10 min)</span>
        <span>🔴 Stale (10+ min)</span>
        <span>⚪ Unknown</span>
        <span>🟣 Historical positions</span>
      </div>
    </div>
  );
}
