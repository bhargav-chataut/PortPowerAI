import { useEffect, useMemo, useState } from "react";
import { scheduleFcfs, type FcfsScheduleResult, type SchedulingInputs, type SchedulingEquipmentType } from "../../../../packages/core/dist/index.js";
import type { PortCode } from "../services/authApi";
import "./PlanningCalendar.css";

type Scale = "day" | "week" | "month" | "year";
type Slot = { id: string; name: string; berthId: string | null; start: number; end: number; equipmentIds: string[]; simulated: boolean; note: string };
const TZ = "America/New_York";
const D = 86400000;
const ymd = (year: number, month: number, day: number) => [year, String(month).padStart(2,"0"), String(day).padStart(2,"0")].join("-");
const parts = (date: Date) => {
  const tokens = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key: string) => tokens.find(t => t.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const dateShift = (date: string, days: number) => {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0,10);
};
const dateMonthShift = (date: string, count: number) => {
  const d = new Date(`${date.slice(0,7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth()+count);
  return d.toISOString().slice(0,7)+"-01";
};
const dateYearShift = (date: string, count: number) => ymd(Number(date.slice(0,4))+count,1,1);
const monthStart = (date: string) => date.slice(0,7)+"-01";
const yearStart = (date: string) => date.slice(0,4)+"-01-01";
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const weekStart = (date: string) => dateShift(date,-((weekday(date)+6)%7));
const short = (d: string, settings: Intl.DateTimeFormatOptions = {month:"short",day:"numeric"}) => new Intl.DateTimeFormat("en-US",{timeZone:"UTC",...settings}).format(new Date(`${d}T12:00:00Z`));
const clock = (ms:number) => new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone:TZ}).format(ms);
const displayDate = (ms:number) => new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:TZ}).format(ms);
function zonedMidnight(day:string) {
  // Compute America/New_York midnight with the appropriate EST/EDT offset for this date.
  const noon=new Date(`${day}T12:00:00Z`);
  const zone=new Intl.DateTimeFormat("en-US",{timeZone:TZ,timeZoneName:"shortOffset"}).formatToParts(noon).find(p=>p.type==="timeZoneName")?.value ?? "GMT-5";
  const m=zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offset=m?(m[1]==="+"?1:-1)*(Number(m[2])*60+Number(m[3]??0)):-300;
  return Date.parse(`${day}T00:00:00Z`)-offset*60000;
}
function bounds(date:string,scale:Scale) {
  const start=scale==="year"?yearStart(date):scale==="month"?monthStart(date):scale==="week"?weekStart(date):date;
  const end=scale==="year"?dateYearShift(start,1):scale==="month"?dateMonthShift(start,1):dateShift(start,scale==="week"?7:1);
  return {start,end,startMs:zonedMidnight(start),endMs:zonedMidnight(end)};
}
function selectCols(scale:Scale,start:string) {
  if (scale==="day") return Array.from({length:24},(_,i)=>({label:`${String(i).padStart(2,"0")}:00`,key:i.toString()}));
  if (scale==="week") return Array.from({length:7},(_,i)=>({label:short(dateShift(start,i),{weekday:"short",day:"numeric"}),key:dateShift(start,i)}));
  if (scale==="month") return Array.from({length:Math.round((Date.parse(dateMonthShift(start,1))-Date.parse(start))/D)},(_,i)=>({label:String(i+1),key:dateShift(start,i)}));
  return Array.from({length:12},(_,i)=>({label:short(ymd(Number(start.slice(0,4)),i+1,1),{month:"short"}),key:String(i)}));
}
function rowOffset(time:number,low:number,high:number) {
  return Math.min(100,Math.max(0,(time-low)/(high-low)*100));
}

export default function PlanningCalendar({port}:{port:PortCode}) {
  const [scale,setScale] = useState<Scale>("month");
  const [cursor,setCursor] = useState("2026-12-01");
  const [snapshot,setSnapshot] = useState<SchedulingInputs|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [runResult,setRunResult] = useState<FcfsScheduleResult|null>(null);
  const [runScope,setRunScope] = useState<string|null>(null);
  const [assume,setAssume] = useState(false);
  const [equipmentKind,setEquipmentKind] = useState<SchedulingEquipmentType>("forklift");
  const [unavailable,setUnavailable] = useState<string[]>([]);
  const [selected,setSelected] = useState<Slot|null>(null);
  const [laneMode,setLaneMode] = useState<"berths"|"equipment">("berths");
  const [reload,setReload] = useState(0);
  const window=useMemo(()=>bounds(cursor,scale),[cursor,scale]);
  const displayRange=scale==="year"?String(cursor.slice(0,4)):scale==="month"?short(monthStart(cursor),{month:"long",year:"numeric"}):`${short(window.start)} – ${short(dateShift(window.end,-1),{month:"short",day:"numeric",year:"numeric"})}`;

  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    setLoading(true);setError(null);setSnapshot(null);setRunResult(null);setRunScope(null);
    fetch("/api/optimization/inputs",{credentials:"include",signal:controller.signal,cache:"no-store"})
      .then(async response => {const result:unknown=await response.json();if(!response.ok){const obj=result as {error?:{message?:string}};throw new Error(obj.error?.message??`Unable to load planning inputs (${response.status})`);}return result as SchedulingInputs;})
      .then(data=>{if(!active)return;if(data.port.code!==port)throw Error("The session is assigned to another port.");setSnapshot(data);})
      .catch(err=>{if(active)setError(err instanceof Error?err.message:"Unable to load planning inputs");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[port,reload]);

  const planningArrivals=snapshot?.arrivals.filter(a=>Date.parse(a.plannedEta)<window.endMs && Date.parse(a.plannedEta)>=window.startMs)??[];
  const allArrivals=snapshot?.arrivals??[];
  const slots:Slot[]=useMemo(()=>{
    if(!snapshot)return [];
    if(runResult && runScope===`${window.start}:${window.end}`)return runResult.assignments.map(a=>{
      const arrival=snapshot.arrivals.find(x=>x.id===a.arrivalId);
      return {id:a.arrivalId,name:arrival?.vesselName??a.mmsi,berthId:a.berthId,start:Date.parse(a.serviceStartUtc),end:Date.parse(a.completionTimeUtc),equipmentIds:a.equipmentIds,simulated:true,note:"Draft FCFS allocation using explicit simulation assumptions"};
    });
    return allArrivals.filter(a=>a.serviceDurationMinutes!==null).map(a=>({
      id:a.id,name:a.vesselName??a.mmsi,berthId:a.preferredBerthId,start:Date.parse(a.plannedEta),
      end:Date.parse(a.plannedEta)+(a.serviceDurationMinutes??0)*60000,
      equipmentIds:[],simulated:false,note:"Unoptimized indication: ETA + estimated service duration. Preferred berth is not a confirmed booking."
    }));
  },[snapshot,runResult,runScope,window.start,window.end,allArrivals]);
  const visibleSlots=slots.filter(s=>s.end>window.startMs&&s.start<window.endMs);
  const resourceRows=laneMode==="berths"?(snapshot?.berths??[]).map(b=>({id:b.id,name:b.name,detail:b.status,active:b.availableForPlanning})):
    (snapshot?.equipment??[]).map(e=>({id:e.id,name:e.code,detail:e.type.replaceAll("_"," "),active:e.availableForPlanning&&!unavailable.includes(e.id)}));
  const mappedRows=resourceRows.map(resource=>({...resource,bookings:visibleSlots.filter(s=>laneMode==="berths"?s.berthId===resource.id:s.equipmentIds.includes(resource.id))}));
  const unassigned=visibleSlots.filter(s=>laneMode==="berths"&&!s.berthId);
  const columns=selectCols(scale,window.start);
  const rowConflict=(a:Slot,b:Slot)=>a.id!==b.id&&a.start<b.end&&b.start<a.end;
  const overlaps=mappedRows.flatMap(r=>r.bookings.filter((s,i)=>r.bookings.slice(i+1).some(t=>rowConflict(s,t))));
  const previewAssumptions=runResult&&runScope===`${window.start}:${window.end}`;
  const resetResult=()=>{setRunResult(null);setRunScope(null);setSelected(null);};
  const move=(step:number)=>{
    setCursor(date=>scale==="day"?dateShift(date,step):scale==="week"?dateShift(date,7*step):scale==="month"?dateMonthShift(date,step):dateYearShift(date,step));
    resetResult();
  };
  const changeScale=(value:Scale)=>{setScale(value);resetResult();};

  function runDraft(){
    if(!snapshot || !assume)return;
    setError(null);setSelected(null);
    try{
      const arrivals=snapshot.arrivals.filter(a=>Date.parse(a.plannedEta)>=window.startMs&&Date.parse(a.plannedEta)<window.endMs);
      if(arrivals.length===0){setError("No arrivals in this window. Choose December 2026 or another planning range.");return;}
      // These values are explicit opt-in demo assumptions, not learned from port infrastructure.
      const assumptions={
        horizonStartUtc:new Date(window.startMs).toISOString(),
        horizonEndUtc:new Date(window.endMs).toISOString(),
        availableResources:{source:"simulated" as const,note:"DEMO: currently available equipment and berths are assumed continuously available during this planning window. No shift/maintenance calendar is stored."},
        equipmentRequirements:arrivals.map(a=>({arrivalId:a.id,source:"simulated" as const,note:`DEMO: one ${equipmentKind} assigned per active vessel call for its full estimated service time; cargo-specific needs not yet modeled.`,requirements:[{type:equipmentKind,count:1}]})),
      };
      const simulatedInput={
        berths:snapshot.berths,
        equipment:snapshot.equipment.map(e=>unavailable.includes(e.id)?{...e,status:"maintenance" as const,availableForPlanning:false}:e),
        arrivals,
        assumptions:snapshot.assumptions,
      };
      const result=scheduleFcfs(simulatedInput,assumptions);
      setRunResult(result);setRunScope(`${window.start}:${window.end}`);setLaneMode("berths");
    }catch(e){setError(e instanceof Error?e.message:"Unable to run scheduling draft");}
  }

  return <div className="pc-root">
    <div className="pc-heading">
      <div><div className="pc-kicker"><span className="pc-pulse"/> PORTPOWER AI / OPERATIONS CONTROL</div><h1>Planning calendar</h1><p>{port==="miami"?"PortMiami":"Port of Gulfport"} · One workspace for bookings, resources and optimization</p></div>
      <div className="pc-meta"><span className="pc-demo">MANAGER PLANS · NOT AIS</span><button className="pc-refresh" type="button" onClick={()=>setReload(n=>n+1)}>↻ Refresh data</button></div>
    </div>
    <div className="pc-toolbar">
      <div className="pc-date-nav"><button aria-label="Previous period" onClick={()=>move(-1)}>‹</button><button onClick={()=>{setCursor("2026-12-01");resetResult();}}>Dec 2026</button><button aria-label="Next period" onClick={()=>move(1)}>›</button><strong>{displayRange}</strong></div>
      <div className="pc-scale" role="group" aria-label="Calendar view">{(["day","week","month","year"] as Scale[]).map(v=><button key={v} className={scale===v?"active":""} onClick={()=>changeScale(v)} aria-pressed={scale===v}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div>
    </div>
    {error&&<div className="pc-error" role="alert">{error}</div>}
    <div className="pc-metrics">
      <div><small>VESSEL CALLS IN VIEW</small><strong>{loading?"—":planningArrivals.length}</strong><span>Planned arrivals</span></div>
      <div><small>BERTHS READY</small><strong>{snapshot?`${snapshot.berths.filter(x=>x.availableForPlanning).length}/${snapshot.berths.length}`:"—"}</strong><span>Recorded status</span></div>
      <div><small>EQUIPMENT READY</small><strong>{snapshot?`${snapshot.equipment.filter(x=>x.availableForPlanning&&!unavailable.includes(x.id)).length}/${snapshot.equipment.length}`:"—"}</strong><span>Excludes scenario outages</span></div>
      <div><small>{previewAssumptions?"DRAFT UNSCHEDULED":"VISIBLE OVERLAPS"}</small><strong>{previewAssumptions?runResult!.unscheduled.length:overlaps.length}</strong><span>{previewAssumptions?"Proposed plan":"Indicative bookings only"}</span></div>
    </div>
    <div className="pc-board">
      <div className="pc-main-board">
        <div className="pc-board-header"><div><div className="pc-kicker">RESOURCE BOARD</div><h2>Traffic & capacity</h2><p>Air-traffic-style lanes · construction-style resource timeline</p></div><div className="pc-mode"><button className={laneMode==="berths"?"active":""} onClick={()=>setLaneMode("berths")}>Berths</button><button className={laneMode==="equipment"?"active":""} onClick={()=>setLaneMode("equipment")}>Equipment</button></div></div>
        <div className="pc-legend"><span><i className="pc-swatch incoming"/>Indicative window</span><span><i className="pc-swatch scheduled"/>Optimizer draft</span><span><i className="pc-swatch restricted"/>Restricted</span></div>
        <div className="pc-timeline-scroll"><div className="pc-timeline">
          <div className="pc-timeline-label pc-timeline-axis-title">RESOURCE / STATUS</div><div className="pc-axis">{columns.map(c=><div key={c.key}>{c.label}</div>)}</div>
          {loading?<div className="pc-timeline-message">Loading Render scheduling inputs…</div>:mappedRows.length===0?<div className="pc-timeline-message">No resources registered for this port.</div>:mappedRows.map(row=><div className="pc-lane" key={row.id}>
            <div className="pc-lane-label"><strong>{row.name}</strong><small className={row.active?"pc-state-ready":"pc-state-blocked"}>{row.detail}</small></div>
            <div className="pc-track">
              {columns.map(c=><span className="pc-gridline" key={c.key}/>)}
              {!row.active&&<span className="pc-track-disabled"/>}
              {row.bookings.map(s=>{
                const left=rowOffset(Math.max(s.start,window.startMs),window.startMs,window.endMs);
                const right=rowOffset(Math.min(s.end,window.endMs),window.startMs,window.endMs);
                return <button type="button" key={s.id} title={`${s.name}: ${displayDate(s.start)} ${clock(s.start)}–${clock(s.end)}`} className={`pc-event ${s.simulated?"pc-scheduled":"pc-incoming"}`} style={{left:`${left}%`,width:`${Math.max(.5,right-left)}%`}} onClick={()=>setSelected(s)} aria-label={`Inspect ${s.name}`}><span>{s.name}</span></button>;
              })}
            </div>
          </div>)}
        </div></div>
        {unassigned.length>0&&<div className="pc-unassigned">{unassigned.length} arrivals have no preferred berth. They do not appear in a berth lane until assigned.</div>}
        <div className="pc-board-footnote">Timeline uses PortMiami local time (Eastern). Indicative bars use ETA + estimated service duration and are not confirmed berth assignments.</div>
      </div>
      <aside className="pc-optimizer">
        <div className="pc-optimizer-head"><span className="pc-ai-symbol">✦</span><div><div className="pc-kicker">SCHEDULING ENGINE</div><h2>Optimizer</h2></div><span className="pc-engine-tag">FCFS v1</span></div>
        <p className="pc-optimizer-summary">Create a berth- and equipment-constrained schedule draft for the displayed calendar period. Nothing is dispatched or saved automatically.</p>
        <div className="pc-optimizer-panel">
          <div className="pc-panel-label">SCENARIO INPUTS</div>
          <label className="pc-field-label">Required equipment per vessel<select value={equipmentKind} onChange={e=>{setEquipmentKind(e.target.value as SchedulingEquipmentType);resetResult();}}>
            {(["forklift","reach_stacker","mobile_crane","gantry_crane","terminal_tractor"] as SchedulingEquipmentType[]).map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
          <div className="pc-panel-label pc-outage-heading">WHAT-IF OUTAGES</div>
          <div className="pc-outages">{(snapshot?.equipment??[]).slice(0,25).map(e=><label key={e.id}><input type="checkbox" checked={unavailable.includes(e.id)} onChange={event=>{setUnavailable(previous=>event.target.checked?[...previous,e.id]:previous.filter(id=>id!==e.id));resetResult();}}/>{e.code}<small>{e.type.replaceAll("_"," ")}</small></label>)}</div>
          <label className="pc-confirm"><input type="checkbox" checked={assume} onChange={e=>{setAssume(e.target.checked);resetResult();}}/><span>I understand this is a <strong>simulation</strong>: one selected machine per vessel and continuous resource availability are assumptions, not verified operational requirements.</span></label>
          <button className="pc-run" type="button" onClick={runDraft} disabled={!snapshot||!assume||loading}>✦ Run draft optimization <span>↗</span></button>
          <small className="pc-no-write">Read-only calculation. No Render schedule writes.</small>
        </div>
        {previewAssumptions&&<div className="pc-results"><div className="pc-panel-label">DRAFT RESULTS</div><div className="pc-result-stats"><div><strong>{runResult!.metrics.scheduledCount}</strong><small>Scheduled</small></div><div><strong>{runResult!.metrics.unscheduledCount}</strong><small>Unscheduled</small></div></div><p>Average wait: <strong>{Math.round(runResult!.metrics.averageWaitingMinutes)} min</strong></p>{runResult!.unscheduled.length>0&&<div className="pc-unscheduled">{runResult!.unscheduled.map(item=><div key={item.arrivalId}><strong>Arrival #{item.arrivalId}</strong><span>{item.message}</span></div>)}</div>}</div>}
        {!previewAssumptions&&<div className="pc-standby"><span>◷</span><strong>Ready to simulate</strong><p>Select assumptions and run a draft to compare available berth/equipment resources against arriving vessels.</p></div>}
        <div className="pc-caveat">Not certified for real-world port dispatch. Actual shifts, cargo requirements, vessel dimensions, maintenance windows and fuel calculations are not in the current dataset.</div>
      </aside>
    </div>
    {selected&&<div className="pc-inspector"><div><span className="pc-kicker">SELECTED VESSEL CALL</span><h3>{selected.name}</h3><p>{displayDate(selected.start)} · {clock(selected.start)} – {displayDate(selected.end)} · {clock(selected.end)}</p><p>{selected.note}</p><p>Berth: {snapshot?.berths.find(b=>b.id===selected.berthId)?.name??"Unassigned"} · Equipment: {selected.equipmentIds.length?selected.equipmentIds.map(id=>snapshot?.equipment.find(e=>e.id===id)?.code??id).join(", "):"Not assigned"}</p></div><button type="button" onClick={()=>setSelected(null)} aria-label="Close details">✕</button></div>}
    <footer className="pc-footer">One operational calendar · Data: authenticated Render planning snapshot · Draft scheduling engine: deterministic FCFS with explicit assumptions. No invented AIS arrivals or guaranteed optimality.</footer>
  </div>;
}
