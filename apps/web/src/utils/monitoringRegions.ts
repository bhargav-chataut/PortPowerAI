import type { MonitoringRegion } from "../services/vesselApi";

// Monitoring rectangles match the vessel backend, not official port boundaries.
export const MONITORING_REGIONS = {
  gulfport: {
    name: "Port of Gulfport",
    location: "Mississippi",
    description: "Primary Blue Economy project location",
    center: [30.3, -89.075] as [number, number],
    south: 30.05, north: 30.55, west: -89.35, east: -88.80,
  },
  miami: {
    name: "PortMiami",
    location: "Florida",
    description: "AIS tracking and testing location",
    center: [25.719, -80.0435] as [number, number],
    south: 25.603, north: 25.835, west: -80.208, east: -79.879,
  },
};

export function isInMonitoringRegion(
  observation: { latitude: number; longitude: number },
  region: MonitoringRegion,
): boolean {
  const bounds = MONITORING_REGIONS[region];
  return Number.isFinite(observation.latitude) && Number.isFinite(observation.longitude) &&
    observation.latitude >= bounds.south && observation.latitude <= bounds.north &&
    observation.longitude >= bounds.west && observation.longitude <= bounds.east;
}
