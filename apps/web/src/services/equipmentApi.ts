
export type EquipmentType =
  | "forklift"
  | "reach_stacker"
  | "mobile_crane"
  | "gantry_crane"
  | "terminal_tractor";

export type EquipmentStatus =
  | "available"
  | "in_use"
  | "maintenance"
  | "out_of_service";

export type EnergyType =
  | "diesel"
  | "electric"
  | "hybrid";

export interface Equipment {
  id: string | number;
  equipment_code: string;
  equipment_type: EquipmentType;
  capacity_tonnes: string | number | null;
  energy_type: EnergyType | null;
  status: EquipmentStatus;
  assigned_berth_id: string | number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEquipmentInput {
  equipment_code: string;
  equipment_type: EquipmentType;
  capacity_tonnes: number | null;
  energy_type: EnergyType;
}

const BASE_URL = "/api/equipment";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error ??
        `Request failed (${response.status})`
    );
  }

  return data as T;
}

export async function getEquipment(
  signal?: AbortSignal
): Promise<Equipment[]> {
  const data = await request<{ equipment: Equipment[] }>(
    "/",
    { signal }
  );

  return data.equipment;
}

export async function createEquipment(
  input: CreateEquipmentInput
): Promise<Equipment> {
  const data = await request<{ equipment: Equipment }>(
    "/",
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );

  return data.equipment;
}

export async function updateEquipmentStatus(
  id: string | number,
  status: EquipmentStatus
): Promise<Equipment> {
  const data = await request<{ equipment: Equipment }>(
    `/${encodeURIComponent(String(id))}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );

  return data.equipment;
}
