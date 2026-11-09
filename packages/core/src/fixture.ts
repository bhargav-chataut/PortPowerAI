import type { OperatingScenario } from "./types.js";

/** Synthetic teaching fixture, not supplied by a port authority or AIS. */
export function createOperatingScenario(): OperatingScenario {
  return {
    schemaVersion: "operations-1.0", id: "gulfport-demo-v1", synthetic: true,
    region: "gulfport", revision: 1, name: "Fictional Gulfport — day plan",
    berths: [{ id: "b1", name: "Demo berth A" }, { id: "b2", name: "Demo berth B" }, { id: "b3", name: "Demo berth C" }],
    vessels: [
      { id: "call1", name: "Fictional Magnolia", berthId: "b1", arrival: 480, departure: 840 },
      { id: "call2", name: "Fictional Pelican", berthId: "b2", arrival: 780, departure: 1140 },
      { id: "call3", name: "Fictional Marsh", berthId: "b1", arrival: 960, departure: 1320 },
    ],
    equipment: [
      ...[1, 2, 3, 4].map(i => ({ id: `f${i}`, name: `Demo forklift ${i}`, kind: "forklift" as const, enabled: true, availableFrom: 360, availableUntil: 1380 })),
      { id: "y1", name: "Demo yard tractor 1", kind: "yard-tractor", enabled: true, availableFrom: 360, availableUntil: 1380 },
      { id: "y2", name: "Demo yard tractor 2", kind: "yard-tractor", enabled: false, availableFrom: 360, availableUntil: 1380 },
    ],
    tasks: [
      { id: "t1", name: "Unload pallet cargo", vesselId: "call1", start: 540, duration: 180, priority: "high", requiredKind: "forklift", equipmentIds: ["f1", "f2"] },
      { id: "t2", name: "Transfer cargo to yard", vesselId: "call1", start: 720, duration: 60, priority: "normal", requiredKind: "yard-tractor", equipmentIds: ["y1"] },
      { id: "t3", name: "Load outbound pallets", vesselId: "call2", start: 840, duration: 180, priority: "high", requiredKind: "forklift", equipmentIds: ["f1", "f3"] },
      { id: "t4", name: "Handle late cargo", vesselId: "call3", start: 1020, duration: 180, priority: "low", requiredKind: "forklift", equipmentIds: ["f2", "f4"] },
    ],
  };
}
