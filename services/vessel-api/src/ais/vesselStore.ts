
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
  
  export function getVessels(): Vessel[] {
    return Array.from(vessels.values());
  }
  