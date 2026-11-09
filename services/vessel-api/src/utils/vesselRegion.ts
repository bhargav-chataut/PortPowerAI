
export type VesselRegion = "gulfport" | "miami" | "other";

export function getVesselRegion(
  latitude: number,
  longitude: number
): VesselRegion {
  if (
    latitude >= 30.05 &&
    latitude <= 30.55 &&
    longitude >= -89.35 &&
    longitude <= -88.80
  ) {
    return "gulfport";
  }

  if (
    latitude >= 25.603 &&
    latitude <= 25.835 &&
    longitude >= -80.208 &&
    longitude <= -79.879
  ) {
    return "miami";
  }

  return "other";
}
