import type { SchedulingArrival, SchedulingInputs, SchedulingEquipmentType } from "../../../../packages/core/dist/index.js";

/** Deterministic non-preemptive scenario planner for a DEMO, not industrial dispatch. */
export type SimulationSettings = {
  equipmentType: SchedulingEquipmentType;
  machinesPerCall: number;
  congestionCount: number;
  congestionStartUtc: string;
  outageEquipmentId: string;
  outageStartUtc: string;
  outageEndUtc: string;
  horizonStartUtc: string;
  horizonEndUtc: string;
};
export type DraftAssignment = {
  arrivalId: string; mmsi: string; plannedEtaUtc: string;
  berthId: string; equipmentIds: string[]; serviceStartUtc: string;
  completionTimeUtc: string; waitingMinutes: number;
  serviceDurationMinutes: number;
};
export type Unscheduled = { arrivalId: string; reason: string };
export type DraftSchedule = {
  assignments: DraftAssignment[];
  unscheduled: Unscheduled[];
  metrics: { scheduledCount: number; unscheduledCount: number; totalWaitingMinutes: number; averageWaitingMinutes: number };
};
export type ScenarioComparison = {
  baseline: DraftSchedule;
  revised: DraftSchedule;
  shiftedArrivals: string[];
  changes: { arrivalId: string; baselineStart: string | null; revisedStart: string | null; deltaMinutes: number | null; reason: string }[];
};
type Block = { start: number; end: number };
const overlap = (a: Block,b: Block) => a.start < b.end && b.start < a.end;
const availableFor = (blocks: Block[], window: Block) => blocks.every(b => !overlap(b,window));
const reject = (message: string): never => { throw new Error(message); };
function schedule(inputs: SchedulingInputs, arrivals: SchedulingArrival[], settings: SimulationSettings, withOutage: boolean): DraftSchedule {
  const horizonStart = Date.parse(settings.horizonStartUtc), horizonEnd = Date.parse(settings.horizonEndUtc);
  if (!(horizonEnd > horizonStart)) reject("Choose a valid calendar horizon.");
  const berths = inputs.berths.filter(x => x.availableForPlanning && x.status === "available").sort((a,b)=>a.id.localeCompare(b.id));
  const machines = inputs.equipment.filter(x=>x.type===settings.equipmentType && x.availableForPlanning && x.status==="available").sort((a,b)=>a.id.localeCompare(b.id));
  const berthBlocks = new Map<string,Block[]>(berths.map(x=>[x.id,[]]));
  const equipBlocks = new Map<string,Block[]>(machines.map(x=>[x.id,[]]));
  if (withOutage && settings.outageEquipmentId) {
    const blocks = equipBlocks.get(settings.outageEquipmentId);
    const a = Date.parse(settings.outageStartUtc), z = Date.parse(settings.outageEndUtc);
    if (!Number.isFinite(a)||!Number.isFinite(z)||z<=a) reject("Outage end must be after outage start.");
    if(blocks) blocks.push({start:a,end:z});
  }
  const sorted = arrivals.slice().sort((a,b)=>Date.parse(a.plannedEta)-Date.parse(b.plannedEta)||a.id.localeCompare(b.id));
  const assignments:DraftAssignment[] = [], unscheduled:Unscheduled[] = [];
  for(const call of sorted) {
    const eta=Date.parse(call.plannedEta);
    const duration=(call.serviceDurationMinutes??0)*60000;
    if(!(duration>0)&&Number.isFinite(duration)) { unscheduled.push({arrivalId:call.id,reason:"Service duration missing."});continue; }
    if(!Number.isFinite(duration)||!Number.isFinite(eta)){unscheduled.push({arrivalId:call.id,reason:"Invalid ETA or service duration."});continue;}
    if(!berths.length){unscheduled.push({arrivalId:call.id,reason:"No available berths."});continue;}
    if(machines.length<settings.machinesPerCall){unscheduled.push({arrivalId:call.id,reason:`Requires ${settings.machinesPerCall} available ${settings.equipmentType.replaceAll("_"," ")} assets; only ${machines.length} available.`});continue;}
    // Only a finite number of intervals matter: ETA, prior vessel completions, and outage releases.
    // A feasible non-preemptive allocation can always be shifted to a resource release boundary.
    const candidates=new Set<number>([Math.max(eta,horizonStart)]);
    for(const blocks of [...berthBlocks.values(),...equipBlocks.values()]) for(const block of blocks) {
      if(block.end>=Math.max(eta,horizonStart)&&block.end<horizonEnd)candidates.add(block.end);
    }
    let chosen: { start:number; berth:string; equipment:string[] } | null=null;
    const preferred=berths.find(x=>x.id===call.preferredBerthId);
    const rankedBerths=preferred?[preferred,...berths.filter(x=>x.id!==preferred.id)]:berths;
    for(const start of [...candidates].sort((a,b)=>a-b)) {
      const end=start+duration;
      if(end>horizonEnd)break;
      const window={start,end};
      const eligible=machines.filter(e=>availableFor(equipBlocks.get(e.id)??[],window)).slice(0,settings.machinesPerCall);
      if(eligible.length<settings.machinesPerCall)continue;
      const berth=rankedBerths.find(x=>availableFor(berthBlocks.get(x.id)??[],window));
      if(!berth)continue;
      chosen={start,berth:berth.id,equipment:eligible.map(e=>e.id)};
      break;
    }
    if(!chosen){unscheduled.push({arrivalId:call.id,reason:"No berth + required equipment interval fits in selected horizon after ETA."});continue;}
    const end=chosen.start+duration, window={start:chosen.start,end};
    berthBlocks.get(chosen.berth)!.push(window);
    for(const id of chosen.equipment)equipBlocks.get(id)!.push(window);
    assignments.push({arrivalId:call.id,mmsi:call.mmsi,plannedEtaUtc:call.plannedEta,berthId:chosen.berth,equipmentIds:chosen.equipment,serviceStartUtc:new Date(chosen.start).toISOString(),completionTimeUtc:new Date(end).toISOString(),waitingMinutes:(chosen.start-eta)/60000,serviceDurationMinutes:duration/60000});
  }
  const totalWaitingMinutes=assignments.reduce((sum,x)=>sum+x.waitingMinutes,0);
  return {assignments,unscheduled,metrics:{scheduledCount:assignments.length,unscheduledCount:unscheduled.length,totalWaitingMinutes,averageWaitingMinutes:assignments.length?totalWaitingMinutes/assignments.length:0}};
}

/** Same Render snapshot. Before = original ETAs/no outage; After = congestion + timed outage. */
export function compareScenario(inputs:SchedulingInputs,settings:SimulationSettings):ScenarioComparison {
  if(!Number.isSafeInteger(settings.machinesPerCall)||settings.machinesPerCall<1||settings.machinesPerCall>10)reject("Choose 1–10 machines per vessel.");
  if(!Number.isSafeInteger(settings.congestionCount)||settings.congestionCount<0||settings.congestionCount>100)reject("Congestion count must be 0–100.");
  const earliest=Date.parse(settings.horizonStartUtc), latest=Date.parse(settings.horizonEndUtc);
  const selected=inputs.arrivals.filter(a=>{const time=Date.parse(a.plannedEta);return time>=earliest&&time<latest;});
  const baseline=schedule(inputs,selected,settings,false);
  const congested=selected.slice().sort((a,b)=>Date.parse(a.plannedEta)-Date.parse(b.plannedEta)||a.id.localeCompare(b.id));
  const congestion=Date.parse(settings.congestionStartUtc);
  if(settings.congestionCount>0 && (!Number.isFinite(congestion)||congestion<earliest||congestion>=latest))reject("Choose a congestion time inside the calendar horizon.");
  const shiftedArrivals:string[]=[];
  const revisedCalls=congested.map((a,i)=>{
    if(i>=settings.congestionCount)return a;
    shiftedArrivals.push(a.id);
    return {...a,plannedEta:new Date(congestion).toISOString()};
  });
  const revised=schedule(inputs,revisedCalls,settings,true);
  const before=new Map(baseline.assignments.map(a=>[a.arrivalId,a]));
  const after=new Map(revised.assignments.map(a=>[a.arrivalId,a]));
  const changes=selected.map(a=>{
    const old=before.get(a.id),next=after.get(a.id);
    const deltaMinutes=old&&next?(Date.parse(next.serviceStartUtc)-Date.parse(old.serviceStartUtc))/60000:null;
    return {arrivalId:a.id,baselineStart:old?.serviceStartUtc??null,revisedStart:next?.serviceStartUtc??null,deltaMinutes,reason:!next?"Unscheduled under revised constraints":!old?"Now scheduled":deltaMinutes!==0?"Start moved":old.berthId!==next.berthId?"Berth changed":old.equipmentIds.join(",")!==next.equipmentIds.join(",")?"Equipment reassigned":"Unchanged"};
  });
  return {baseline,revised,shiftedArrivals,changes};
}
