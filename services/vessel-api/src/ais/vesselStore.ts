
import { getVesselRegion, type VesselRegion } from "../utils/vesselRegion.js";

export interface Vessel {
  mmsi: number;
  name: string;
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  lastUpdated: string;
}

const vessels = new Map<number, Vessel>();

export function saveVessel(vessel: Vessel): void {
  vessels.set(vessel.mmsi, vessel);
}

export function getVessels(region?: Exclude<VesselRegion, "other">): Vessel[] {
  const latest = Array.from(vessels.values());
  return region === undefined
    ? latest
    : latest.filter(
        (vessel) => getVesselRegion(vessel.latitude, vessel.longitude) === region
      );
}
