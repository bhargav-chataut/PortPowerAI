
/**
 * A vessel's latest observed AIS position.
 */
export interface Vessel {
  mmsi: number;
  name: string;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  lastUpdated: string;
}

/**
 * Supported monitoring regions.
 */
export type MonitoringRegion = "gulfport" | "miami";

/**
 * API response containing vessel observations.
 */
export interface VesselResponse {
  region?: string;
  count: number;
  vessels: Vessel[];
}

/**
 * Fetch the latest vessel observations.
 *
 * Examples:
 * fetchVessels()          -> all regions
 * fetchVessels("gulfport") -> Gulfport
 * fetchVessels("miami")    -> Miami
 */
export async function fetchVessels(
  region?: MonitoringRegion,
  signal?: AbortSignal,
): Promise<VesselResponse> {
  const query = region
    ? `?region=${encodeURIComponent(region)}`
    : "";

  const response = await fetch(`/api/vessels${query}`, { signal });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch vessels: ${response.status}`
    );
  }

  return (await response.json()) as VesselResponse;
}

/**
 * A historical AIS position stored in PostgreSQL.
 */
export interface VesselPosition {
  id: string;
  mmsi: string;
  latitude: number;
  longitude: number;
  speed_knots: number | null;
  received_at: string;
  region?: string;
}

/**
 * API response containing historical positions.
 */
export interface VesselHistoryResponse {
  mmsi: number;
  count: number;
  positions: VesselPosition[];
}

/**
 * Retrieve historical observations for a vessel.
 */
export async function fetchVesselHistory(
  mmsi: number,
  limit = 100
): Promise<VesselHistoryResponse> {
  const response = await fetch(
    `/api/vessels/${mmsi}/history?limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch vessel history: ${response.status}`
    );
  }

  return (await response.json()) as VesselHistoryResponse;
}
