import type { Berth } from "./arrivalApi";

export const BERTH_STATUSES = ["available", "occupied", "maintenance", "closed"] as const;
export type BerthStatus = typeof BERTH_STATUSES[number];
export type ManagedBerth = Omit<Berth, "status"> & { status: BerthStatus };
export interface BerthUpdate { status?: BerthStatus; max_length_m?: number | null; max_draft_m?: number | null }

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`/api/berths${path}`, { ...options, credentials: "include" });
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("Your session has expired. Sign in again to manage berths.");
  if (!response.ok) throw new Error(data?.error ?? `Berth request failed (${response.status})`);
  return data as T;
}

export async function getBerths(signal?: AbortSignal): Promise<ManagedBerth[]> {
  return (await request<{ berths: ManagedBerth[] }>("", { signal })).berths;
}

export async function updateBerth(id: string | number, changes: BerthUpdate): Promise<ManagedBerth> {
  return (await request<{ berth: ManagedBerth }>(`/${encodeURIComponent(String(id))}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes),
  })).berth;
}

export function parseBerthCapacity(value: string, maximum: number): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > maximum || Math.round(number * 100) / 100 !== number) {
    throw new Error("Capacity must be positive metres with at most two decimal places and within the field limit.");
  }
  return number;
}
