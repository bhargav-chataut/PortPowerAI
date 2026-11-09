import assert from "node:assert/strict";
import test from "node:test";
import { compareScenario } from "../src/services/constraintScheduler.ts";
import type { SchedulingInputs } from "../../../packages/core/src/types.ts";

const day = (date: number) => `2026-12-${String(date).padStart(2,"0")}T13:00:00.000Z`;
function fixture(count = 4): SchedulingInputs {
  return {
    schemaVersion:"scheduling-inputs-1.0",source:"manager-planning-records",
    port:{id:"1",code:"miami"},units:{dimensions:"m",equipmentCapacity:"tonnes",duration:"minutes",timestamps:"UTC ISO 8601"},
    berths:[1,2,3].map(i=>({id:String(i),berthNumber:i,name:`Berth ${i}`,status:"available" as const,maxLengthM:null,maxDraftM:null,availableForPlanning:true})),
    equipment:[1,2,3,4].map(i=>({id:String(i),code:`SIM-FL-${i}`,type:"forklift" as const,capacityTonnes:5,energyType:"electric" as const,status:"available" as const,assignedBerthId:null,availableForPlanning:true,productivity:null})),
    arrivals:Array.from({length:count},(_,i)=>({id:String(i+1),mmsi:`999${String(i+1).padStart(6,"0")}`,vesselName:`Synthetic ${i+1}`,plannedEta:day(10+i),cargoType:"general" as const,workload:{quantity:100,unit:"tonnes" as const},serviceDurationMinutes:6*60,durationSource:"simulated" as const,preferredBerthId:null,status:"planned" as const,equipmentRequirements:null})),
    assumptions:[],issues:[],readyForScheduling:true,limitations:[]
  };
}
const settings = {
  equipmentType:"forklift" as const,machinesPerCall:2,congestionCount:4,
  congestionStartUtc:day(10),outageEquipmentId:"1",
  outageStartUtc:day(10),outageEndUtc:"2026-12-10T21:00:00.000Z",
  horizonStartUtc:"2026-12-01T05:00:00.000Z",
  horizonEndUtc:"2027-01-01T05:00:00.000Z"
};

test("congestion and a timed outage increase wait versus original arrivals",()=>{
  const result=compareScenario(fixture(),settings);
  assert.equal(result.baseline.metrics.scheduledCount,4);
  assert.equal(result.baseline.metrics.totalWaitingMinutes,0);
  assert.equal(result.revised.metrics.scheduledCount,4);
  assert.ok(result.revised.metrics.totalWaitingMinutes>0);
  assert.ok(result.changes.some(c=>c.deltaMinutes!==null&&c.deltaMinutes>0));
});

test("revised draft never double-books a berth or machine",()=>{
  const {revised}=compareScenario(fixture(),settings);
  for(let i=0;i<revised.assignments.length;i++)for(let j=i+1;j<revised.assignments.length;j++){
    const a=revised.assignments[i],b=revised.assignments[j];
    const intersects=Date.parse(a.serviceStartUtc)<Date.parse(b.completionTimeUtc)&&Date.parse(b.serviceStartUtc)<Date.parse(a.completionTimeUtc);
    if(intersects){
      assert.notEqual(a.berthId,b.berthId);
      assert.equal(a.equipmentIds.some(x=>b.equipmentIds.includes(x)),false);
    }
  }
});

test("outage window blocks selected machine until its release",()=>{
  const result=compareScenario(fixture(),settings);
  const end=Date.parse(settings.outageEndUtc),start=Date.parse(settings.outageStartUtc);
  for(const booking of result.revised.assignments.filter(x=>x.equipmentIds.includes(settings.outageEquipmentId))){
    assert.ok(Date.parse(booking.completionTimeUtc)<=start||Date.parse(booking.serviceStartUtc)>=end);
  }
});

test("scarce resources produce unscheduled calls, not fictional allocations",()=>{
  const congested=fixture();
  congested.arrivals=congested.arrivals.map(a=>({...a,plannedEta:day(10)}));
  const result=compareScenario(congested,{
    ...settings,machinesPerCall:4,horizonStartUtc:"2026-12-10T05:00:00.000Z",
    horizonEndUtc:"2026-12-11T05:00:00.000Z",congestionCount:4
  });
  assert.ok(result.revised.unscheduled.length>0);
});
