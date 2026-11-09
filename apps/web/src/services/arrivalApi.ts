
export type CargoType =
  | "containers"
  | "general"
  | "bulk"
  | "roro";

export interface Berth {
  id: string | number;
  berth_number: number;
  name: string;
  status: string;
  max_length_m: number | string | null;
  max_draft_m: number | string | null;
}

export interface Arrival {
  id: string | number;
  mmsi: string;
  vessel_name: string | null;
  planned_eta: string;
  cargo_type: CargoType;
  workload_quantity: number | string;
  workload_unit: string;
  estimated_service_hours: number | string | null;
  preferred_berth_id: string | number | null;
  preferred_berth_name?: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface CreateArrivalInput {
  mmsi: string;
  vessel_name: string | null;
  planned_eta: string;
  cargo_type: CargoType;
  workload_quantity: number;
  estimated_service_hours: number | null;
  preferred_berth_id: string | null;
  notes: string | null;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `/api/arrivals${path}`,
    {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Request failed: ${response.status}`
    );
  }

  return data as T;
}

export async function getArrivals(
  signal?: AbortSignal
): Promise<Arrival[]> {
  const data = await apiRequest<{ arrivals: Arrival[] }>(
    "/",
    { signal }
  );

  return data.arrivals;
}

export async function getArrivalBerths(
  signal?: AbortSignal
): Promise<Berth[]> {
  const data = await apiRequest<{ berths: Berth[] }>(
    "/berths",
    { signal }
  );

  return data.berths;
}

export async function createArrival(
  input: CreateArrivalInput
): Promise<Arrival> {
  const data = await apiRequest<{ arrival: Arrival }>(
    "/",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return data.arrival;
}
