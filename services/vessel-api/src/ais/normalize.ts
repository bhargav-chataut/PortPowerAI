import type { Vessel } from "./vesselStore.js";

export const POSITION_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Normalize position broadcasts only; timestamp is SERVER RECEIPT time, not AIS transmit time. */
export function normalizePosition(payload: unknown, receivedAt: string): Vessel | null {
  const envelope = record(payload);
  const type = envelope?.MessageType;
  if (typeof type !== "string" || !POSITION_TYPES.some((item) => item === type)) return null;

  const metadata = record(envelope?.MetaData);
  const messages = record(envelope?.Message);
  const position = record(messages?.[type]);
  if (!metadata || !position || position.Valid === false) return null;

  const mmsi = Number(metadata.MMSI);
  if (!Number.isInteger(mmsi) || mmsi < 100000000 || mmsi > 999999999) return null;

  // AISStream's typed reports contain coordinates even when MetaData omits them.
  const latitude = position.Latitude ?? metadata.Latitude;
  const longitude = position.Longitude ?? metadata.Longitude;
  if (
    typeof latitude !== "number" || typeof longitude !== "number" ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
  ) return null;

  const sog = position.Sog;
  const speedKnots = typeof sog === "number" && Number.isFinite(sog) && sog >= 0 && sog < 102.3
    ? sog : null;
  const rawName = metadata.ShipName;
  const name = typeof rawName === "string" && rawName.trim()
    ? rawName.trim() : "Unknown Vessel";

  return { mmsi, name, latitude, longitude, speedKnots, lastUpdated: receivedAt };
}
