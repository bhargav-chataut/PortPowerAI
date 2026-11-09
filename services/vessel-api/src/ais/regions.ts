export type VesselRegion = "gulfport" | "miami";

export const MONITORING_AREAS = [
  {
    id: "gulfport",
    bounds: [[30.55, -89.35], [30.05, -88.80]],
  },
  {
    id: "miami",
    bounds: [[25.835, -80.208], [25.603, -79.879]],
  },
] as const;

export function classifyRegion(latitude: number, longitude: number): VesselRegion | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  for (const area of MONITORING_AREAS) {
    const [cornerA, cornerB] = area.bounds;
    const minLat = Math.min(cornerA[0], cornerB[0]);
    const maxLat = Math.max(cornerA[0], cornerB[0]);
    const minLon = Math.min(cornerA[1], cornerB[1]);
    const maxLon = Math.max(cornerA[1], cornerB[1]);
    if (latitude >= minLat && latitude <= maxLat && longitude >= minLon && longitude <= maxLon) {
      return area.id;
    }
  }
  return null;
}
