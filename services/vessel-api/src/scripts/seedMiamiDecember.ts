import "dotenv/config";
import { pool } from "../config/db.js";

// Safe shared-Render seed: synthetic planning rows only, no existing row updates/deletes.
// Run "npm run seed:miami-december" to preview; add "-- --apply" to commit.
const TAG = "[PORTPOWER-MIAMI-DEC2026-DEMO]";
const APPLY = process.argv.includes("--apply");
const TYPES = ["forklift","reach_stacker","mobile_crane","gantry_crane","terminal_tractor"] as const;
const ENERGIES = ["diesel","electric","hybrid"] as const;
const CARGOS = ["containers","general","bulk","roro"] as const;
const UNITS = { containers: "container_moves", general:"tonnes", bulk:"tonnes", roro:"vehicle_moves" } as const;
const names = ["Atlantic Horizon","Harbor Meridian","Bluewater Delta","Ocean Crescent","Mariner Dawn","Coral Venture","Bay Sentinel","Silver Current","Tidal Pioneer","Coastal Beacon","Sea Lantern","Port Horizon","Southern Wake","Harbor Atlas","Emerald Passage","Tropic Star","Ocean Compass","Maritime Echo","Channel Explorer","Pacific Cove"];
const equipment = Array.from({length:20},(_,i)=>({
  code: `DEMO-MIA-26-${String(i+1).padStart(2,"0")}`,
  type: TYPES[i%TYPES.length],
  energy: ENERGIES[i%ENERGIES.length],
  capacity: [5,35,70,100,50][i%5],
}));
const arrivals = Array.from({length:20},(_,i)=>{
  const day = 1 + i*1 + (i>9?0:0); // Dec 1-20; distributed across weeks.
  const time = [7,9,11,13,15][i%5];
  const cargo = CARGOS[i%CARGOS.length];
  const workload = cargo==="containers" ? 75 + i*4 : cargo==="roro" ? 95 + i*3 : 160 + i*12;
  return {
    mmsi: `999${String(i+1).padStart(6,"0")}`, // intentionally synthetic, not an AIS assertion
    name: `SIMULATED ${names[i]}`,
    eta: `2026-12-${String(day).padStart(2,"0")}T${String(time).padStart(2,"0")}:00:00-05:00`,
    cargo,
    workload,
    serviceHours: 4 + (i%4)*2,
    notes: `${TAG} Scenario-only planning record; invented name, MMSI, ETA, cargo, duration and berth preference. NOT real PortMiami arrivals or AIS predictions.`
  };
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required; refusing local database fallback.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Prevent concurrent seed runs from creating duplicate arrival rows.
    await client.query("SELECT pg_advisory_xact_lock(865217, 202612)");
    const ports = await client.query("SELECT id FROM ports WHERE code = 'miami'");
    if (ports.rowCount !== 1) throw new Error("Miami port is missing or ambiguous.");
    const portId: string = String(ports.rows[0].id);
    const berthRows = await client.query("SELECT id, berth_number FROM manager_berths WHERE port_id=$1 ORDER BY berth_number", [portId]);
    if (berthRows.rows.length < 1) throw new Error("Miami must have at least one berth. Nothing written.");
    const existingEquipment = await client.query("SELECT equipment_code FROM manager_equipment WHERE port_id=$1 AND equipment_code LIKE 'DEMO-MIA-26-%'",[portId]);
    const existingCalls = await client.query("SELECT mmsi FROM manager_vessel_arrivals WHERE port_id=$1 AND notes LIKE $2",[portId,`%${TAG}%`]);
    const codes = new Set<string>(existingEquipment.rows.map(row=>String(row.equipment_code)));
    const seen = new Set<string>(existingCalls.rows.map(row=>String(row.mmsi)));
    const newEquipment = equipment.filter(item=>!codes.has(item.code));
    const newArrivals = arrivals.filter(item=>!seen.has(item.mmsi));
    const collisions = await client.query("SELECT mmsi FROM manager_vessel_arrivals WHERE port_id=$1 AND mmsi = ANY($2::text[]) AND (notes IS NULL OR notes NOT LIKE $3)",[portId,arrivals.map(x=>x.mmsi),`%${TAG}%`]);
    if (collisions.rowCount) throw new Error("An MMSI is already used by a non-demo planning record. Refusing to modify any records.");
    console.log(`Miami Render seed ${APPLY?"APPLY":"PREVIEW"}: ${newEquipment.length} new equipment, ${newArrivals.length} new synthetic Dec 2026 calls; ${equipment.length-newEquipment.length} + ${arrivals.length-newArrivals.length} already seeded.`);
    console.log(`Using ${berthRows.rowCount} existing Miami berth(s); no berth changes.`);
    if (APPLY) {
      for (const e of newEquipment) await client.query(
        "INSERT INTO manager_equipment(port_id,equipment_code,equipment_type,capacity_tonnes,energy_type,status) VALUES($1,$2,$3,$4,$5,'available')",
        [portId,e.code,e.type,e.capacity,e.energy]
      );
      for (const call of newArrivals) {
        const idx = arrivals.indexOf(call);
        const berth = berthRows.rows[idx % berthRows.rows.length];
        await client.query(`INSERT INTO manager_vessel_arrivals(port_id,mmsi,vessel_name,planned_eta,cargo_type,workload_quantity,workload_unit,estimated_service_hours,preferred_berth_id,notes,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'planned')`,
          [portId,call.mmsi,call.name,call.eta,call.cargo,call.workload,UNITS[call.cargo],call.serviceHours,berth.id,call.notes]
        );
      }
      await client.query("COMMIT");
      console.log("Seed committed to configured Render PostgreSQL. Existing non-demo rows were not modified.");
    } else {
      await client.query("ROLLBACK");
      console.log("Dry run only. No rows inserted. Re-run with --apply after reviewing the preview.");
    }
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
main().catch(error=>{ console.error("Miami seed failed:",error);process.exitCode=1; }).finally(async()=>pool.end());
