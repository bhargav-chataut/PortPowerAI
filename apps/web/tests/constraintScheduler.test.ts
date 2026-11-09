import assert from "node:assert/strict";
import test from "node:test";
import { planFromRecords } from "../src/services/constraintScheduler.ts";
import type { SchedulingInputs } from "../../../packages/core/src/types.ts";

const day = (date:number,hour=13) => `2026-12-${String(date).padStart(2,"0")}T${String(hour).padStart(2,"0")}:00:00.000Z`;
function fixture(count=4):SchedulingInputs {
  return {
    schemaVersion:"scheduling-inputs-1.0",source:"manager-planning-records",
    port:{id:"1",code:"miami"},units:{dimensions:"m",equipmentCapacity:"tonnes",duration:"minutes",timestamps:"UTC ISO 8601"},
    berths:[1,2,3].map(i=>({id:String(i),berthNumber:i,name:`Berth ${i}`,status:"available" as const,maxLengthM:null,maxDraftM:null,availableForPlanning:true})),
    equipment:[1,2,3,4].map(i=>({id:String(i),code:`SIM-FL-${i}`,type:"forklift" as const,capacityTonnes:5,energyType:"electric" as const,status:"available" as const,assignedBerthId:null,availableForPlanning:true,productivity:null})),
    arrivals:Array.from({length:count},(_,i)=>({id:String(i+1),mmsi:`999${String(i+1).padStart(6,"0")}`,vesselName:`Synthetic ${i+1}`,plannedEta:day(10+i),cargoType:"general" as const,workload:{quantity:100,unit:"tonnes" as const},serviceDurationMinutes:6*60,durationSource:"simulated" as const,preferredBerthId:null,status:"planned" as const,equipmentRequirements:null})),
    assumptions:[],issues:[],readyForScheduling:true,limitations:[]
  };
}
const settings={
  equipmentType:"forklift" as const,machinesPerCall:2,
  horizonStartUtc:"2026-12-01T05:00:00.000Z",
  horizonEndUtc:"2027-01-01T05:00:00.000Z"
};

test("uses recorded ETAs without moving arrivals to an artificial congestion day",()=>{
  const result=planFromRecords(fixture(),settings);
  assert.equal(result.metrics.scheduledCount,4);
  assert.equal(result.metrics.totalWaitingMinutes,0);
  for(const booking of result.assignments)assert.equal(booking.serviceStartUtc,booking.plannedEtaUtc);
});

test("manager-marked unavailable equipment is excluded",()=>{
  const inputs=fixture();
  inputs.equipment=inputs.equipment.map(e=>e.id==="1"?{...e,status:"maintenance" as const,availableForPlanning:false}:e);
  const result=planFromRecords(inputs,settings);
  assert.equal(result.metrics.scheduledCount,4);
  assert.ok(result.assignments.every(a=>!a.equipmentIds.includes("1")));
});

test("insufficient available equipment leaves calls unscheduled",()=>{
  const inputs=fixture();
  inputs.equipment=inputs.equipment.map((e,i)=>i===0?e:{...e,status:"out_of_service" as const,availableForPlanning:false});
  const result=planFromRecords(inputs,settings);
  assert.equal(result.metrics.scheduledCount,0);
  assert.equal(result.metrics.unscheduledCount,4);
  assert.match(result.unscheduled[0].reason,/only 1 currently marked Available/);
});

test("recorded same-day arrivals create delays without changing ETA",()=>{
  const inputs=fixture();
  inputs.arrivals=inputs.arrivals.map(a=>({...a,plannedEta:day(10)}));
  const result=planFromRecords(inputs,settings);
  assert.equal(result.metrics.scheduledCount,4);
  assert.ok(result.metrics.delayedCount>0);
  assert.ok(result.assignments.some(a=>a.waitingMinutes>0));
  for(const a of result.assignments)assert.equal(a.plannedEtaUtc,day(10));
});

test("no concurrent berth or equipment double booking",()=>{
  const inputs=fixture();
  inputs.arrivals=inputs.arrivals.map(a=>({...a,plannedEta:day(10)}));
  const {assignments}=planFromRecords(inputs,settings);
  for(let i=0;i<assignments.length;i++)for(let j=i+1;j<assignments.length;j++){
    const a=assignments[i],b=assignments[j];
    if(Date.parse(a.serviceStartUtc)<Date.parse(b.completionTimeUtc)&&Date.parse(b.serviceStartUtc)<Date.parse(a.completionTimeUtc)){
      assert.notEqual(a.berthId,b.berthId);
      assert.equal(a.equipmentIds.some(id=>b.equipmentIds.includes(id)),false);
    }
  }
});
