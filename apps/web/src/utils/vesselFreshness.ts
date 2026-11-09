
export type FreshnessStatus =
  | "recent"
  | "aging"
  | "stale"
  | "unknown";

export function getVesselFreshness(
  lastUpdated: string
): FreshnessStatus {
  const receivedTime = new Date(lastUpdated).getTime();

  if (!Number.isFinite(receivedTime)) {
    return "unknown";
  }

  const ageSeconds =
    (Date.now() - receivedTime) / 1000;

  if (ageSeconds < -30) {
    return "unknown";
  }

  if (ageSeconds <= 120) {
    return "recent";
  }

  if (ageSeconds <= 600) {
    return "aging";
  }

  return "stale";
}

export function formatLastReceived(
  lastUpdated: string
): string {
  const receivedTime = new Date(lastUpdated).getTime();

  if (!Number.isFinite(receivedTime)) {
    return "Unknown";
  }

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - receivedTime) / 1000)
  );

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }

  return `${Math.floor(seconds / 3600)}h ago`;
}
