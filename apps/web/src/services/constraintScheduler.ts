import type { SchedulingArrival, SchedulingInputs, SchedulingEquipmentType } from "../../../../packages/core/dist/index.js";

/** Read-only berth and equipment planning against recorded ETAs and statuses.
 * Equipment requirements are explicit demo assumptions until entered per vessel.
 * This is an FCFS heuristic, not a global optimality or dispatch guarantee.
 */
export type PlanningSettings = {
  equipmentType: SchedulingEquipmentType;
  machinesPerCall: number;
  horizonStartUtc: string;
  horizonEndUtc: string;
};
export type DraftAssignment = {
  arrivalId: string;
  mmsi: string;
  plannedEtaUtc: string;
  berthId: string;
  equipmentIds: string[];
  serviceStartUtc: string;
  completionTimeUtc: string;
  waitingMinutes: number;
  serviceDurationMinutes: number;
};
export type Unscheduled = { arrivalId: string; reason: string };
export type DraftSchedule = {
  assignments: DraftAssignment[];
  unscheduled: Unscheduled[];
  metrics: {
    scheduledCount: number;
    unscheduledCount: number;
    delayedCount: number;
    totalWaitingMinutes: number;
    averageWaitingMinutes: number;
  };
};
type Block = { start: number; end: number };
const overlap = (a: Block,b: Block) => a.start < b.end && b.start < a.end;
const availableFor = (blocks: Block[], window: Block) => blocks.every(b => !overlap(b,window));
const fail = (message:string):never => { throw new Error(message); };

export function planFromRecords(inputs: SchedulingInputs, settings: PlanningSettings): DraftSchedule {
  const horizonStart = Date.parse(settings.horizonStartUtc);
  const horizonEnd = Date.parse(settings.horizonEndUtc);
  if (!Number.isFinite(horizonStart) || !Number.isFinite(horizonEnd) || horizonEnd <= horizonStart) fail("Choose a valid planning period.");
  if (!Number.isSafeInteger(settings.machinesPerCall) || settings.machinesPerCall < 1 || settings.machinesPerCall > 10) fail("Choose 1–10 machines per vessel.");
  const berths = inputs.berths.filter(x=>x.status==="available"&&x.availableForPlanning).sort((a,b)=>a.id.localeCompare(b.id));
  const equipment = inputs.equipment.filter(x=>x.status==="available"&&x.availableForPlanning&&x.type===settings.equipmentType).sort((a,b)=>a.id.localeCompare(b.id));
  const berthBlocks = new Map<string,Block[]>(berths.map(x=>[x.id,[]]));
  const equipmentBlocks = new Map<string,Block[]>(equipment.map(x=>[x.id,[]]));
  const arrivals:SchedulingArrival[] = inputs.arrivals.filter(a=>{
    const eta=Date.parse(a.plannedEta);
    return eta>=horizonStart&&eta<horizonEnd;
  }).sort((a,b)=>Date.parse(a.plannedEta)-Date.parse(b.plannedEta)||a.id.localeCompare(b.id));
  const assignments:DraftAssignment[]=[];
  const unscheduled:Unscheduled[]=[];
  for (const call of arrivals) {
    const eta=Date.parse(call.plannedEta);
    const duration=(call.serviceDurationMinutes??0)*60000;
    if (!(duration>0) || !Number.isFinite(duration)) {unscheduled.push({arrivalId:call.id,reason:"Estimated service duration is missing."});continue;}
    if (!berths.length) {unscheduled.push({arrivalId:call.id,reason:"No berths are marked Available in Berth Management."});continue;}
    if (equipment.length<settings.machinesPerCall) {
      unscheduled.push({arrivalId:call.id,reason:`Needs ${settings.machinesPerCall} available ${settings.equipmentType.replaceAll("_"," ")} machines; only ${equipment.length} currently marked Available. Update Equipment Management or change the explicitly assumed requirement.`});
      continue;
    }
    // Feasible starts only change when a booked berth or machine becomes free.
    const starts=new Set<number>([Math.max(eta,horizonStart)]);
    for (const blocks of [...berthBlocks.values(),...equipmentBlocks.values()]) {
      for (const block of blocks) if(block.end>=eta && block.end<horizonEnd) starts.add(block.end);
    }
    const preferred=berths.find(b=>b.id===call.preferredBerthId);
    const berthChoices=preferred?[preferred,...berths.filter(b=>b.id!==preferred.id)]:berths;
    let selected:{start:number;berthId:string;equipmentIds:string[]}|null=null;
    for(const start of [...starts].sort((a,b)=>a-b)){
      const end=start+duration;
      if (end>horizonEnd) break;
      const interval={start,end};
      for(const berth of berthChoices){
        if(!availableFor(berthBlocks.get(berth.id)??[],interval))continue;
        const eligible=equipment.filter(machine=>
          (machine.assignedBerthId===null||machine.assignedBerthId===berth.id)&&availableFor(equipmentBlocks.get(machine.id)??[],interval)
        ).slice(0,settings.machinesPerCall);
        if(eligible.length===settings.machinesPerCall){
          selected={start,berthId:berth.id,equipmentIds:eligible.map(e=>e.id)};
          break;
        }
      }
      if(selected)break;
    }
    if(!selected) {
      unscheduled.push({arrivalId:call.id,reason:"No berth and equipment interval fits between recorded ETA and the end of the selected planning period."});
      continue;
    }
    const end=selected.start+duration, interval={start:selected.start,end};
    berthBlocks.get(selected.berthId)!.push(interval);
    for (const id of selected.equipmentIds) equipmentBlocks.get(id)!.push(interval);
    assignments.push({
      arrivalId:call.id,mmsi:call.mmsi,plannedEtaUtc:call.plannedEta,berthId:selected.berthId,equipmentIds:selected.equipmentIds,
      serviceStartUtc:new Date(selected.start).toISOString(),
      completionTimeUtc:new Date(end).toISOString(),
      waitingMinutes:(selected.start-eta)/60000,serviceDurationMinutes:duration/60000
    });
  }
  const totalWaitingMinutes=assignments.reduce((sum,a)=>sum+a.waitingMinutes,0);
  return {assignments,unscheduled,metrics:{
    scheduledCount:assignments.length,unscheduledCount:unscheduled.length,
    delayedCount:assignments.filter(a=>a.waitingMinutes>0).length,
    totalWaitingMinutes,averageWaitingMinutes:assignments.length?totalWaitingMinutes/assignments.length:0
  }};
}
