import { useEffect, useMemo, useState } from "react";
import type { SchedulingInputs, SchedulingEquipmentType } from "../../../../packages/core/dist/index.js";
import { planFromRecords, type DraftSchedule } from "../services/constraintScheduler";
import { Link } from "react-router-dom";
import type { PortCode } from "../services/authApi";
import "./PlanningCalendar.css";

type Scale = "day" | "week" | "month" | "year";
type Slot = { id: string; name: string; berthId: string | null; start: number; end: number; equipmentIds: string[]; simulated: boolean; note: string };
const TZ = "America/New_York";
const D = 86400000;
const ymd = (year: number, month: number, day: number) => [year, String(month).padStart(2,"0"), String(day).padStart(2,"0")].join("-");
const parts = (date: Date, timeZone = TZ) => {
  const tokens = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
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
const clock = (ms:number,timeZone=TZ) => new Intl.DateTimeFormat("en-US",{hour:"numeric",minute:"2-digit",timeZone}).format(ms);
const displayDate = (ms:number,timeZone=TZ) => new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone}).format(ms);
function zonedMidnight(day:string,timeZone=TZ) {
  // Compute America/New_York midnight with the appropriate EST/EDT offset for this date.
  const noon=new Date(`${day}T12:00:00Z`);
  const zone=new Intl.DateTimeFormat("en-US",{timeZone,timeZoneName:"shortOffset"}).formatToParts(noon).find(p=>p.type==="timeZoneName")?.value ?? "GMT-5";
  const m=zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offset=m?(m[1]==="+"?1:-1)*(Number(m[2])*60+Number(m[3]??0)):-300;
  return Date.parse(`${day}T00:00:00Z`)-offset*60000;
}
function bounds(date:string,scale:Scale,timeZone=TZ) {
  const start=scale==="year"?yearStart(date):scale==="month"?monthStart(date):scale==="week"?weekStart(date):date;
  const end=scale==="year"?dateYearShift(start,1):scale==="month"?dateMonthShift(start,1):dateShift(start,scale==="week"?7:1);
  return {start,end,startMs:zonedMidnight(start,timeZone),endMs:zonedMidnight(end,timeZone)};
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
  const timeZone=port==="miami"?"America/New_York":"America/Chicago";
  const [scale,setScale] = useState<Scale>("month");
  const [cursor,setCursor] = useState("2026-12-01");
  const [snapshot,setSnapshot] = useState<SchedulingInputs|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [runResult,setRunResult] = useState<DraftSchedule|null>(null);
  const [runScope,setRunScope] = useState<string|null>(null);
  const [autoRun,setAutoRun] = useState(false);
  const [equipmentKind,setEquipmentKind] = useState<SchedulingEquipmentType>("forklift");
  const [machinesPerCall,setMachinesPerCall] = useState(1);
  const [selected,setSelected] = useState<Slot|null>(null);
  const [laneMode,setLaneMode] = useState<"berths"|"equipment">("berths");
  const [reload,setReload] = useState(0);
  const window=useMemo(()=>bounds(cursor,scale,timeZone),[cursor,scale,timeZone]);
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
    if(runResult)return runResult.assignments.map(a=>{
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
  const comparisonReady=runResult!==null && runScope!==null && window.startMs < zonedMidnight(runScope.split(":")[1],timeZone) && window.endMs > zonedMidnight(runScope.split(":")[0],timeZone);
  const resourceRows=laneMode==="berths"?(snapshot?.berths??[]).map(b=>({id:b.id,name:b.name,detail:b.status,active:b.availableForPlanning})):
    (snapshot?.equipment??[]).map(e=>({id:e.id,name:e.code,detail:e.type.replaceAll("_"," "),active:e.availableForPlanning}));
  const mappedRows=resourceRows.map(resource=>({...resource,bookings:visibleSlots.filter(s=>laneMode==="berths"?s.berthId===resource.id:s.equipmentIds.includes(resource.id))}));
  const unassigned=visibleSlots.filter(s=>laneMode==="berths"&&!s.berthId);
  const columns=selectCols(scale,window.start);
  const rowConflict=(a:Slot,b:Slot)=>a.id!==b.id&&a.start<b.end&&b.start<a.end;
  const overlaps=mappedRows.flatMap(r=>r.bookings.filter((s,i)=>r.bookings.slice(i+1).some(t=>rowConflict(s,t))));
  const previewAssumptions=comparisonReady;
  const resetResult=()=>{setRunResult(null);if(!autoRun)setRunScope(null);setSelected(null);};
  const move=(step:number)=>{
    setCursor(date=>scale==="day"?dateShift(date,step):scale==="week"?dateShift(date,7*step):scale==="month"?dateMonthShift(date,step):dateYearShift(date,step));
    setSelected(null);
  };
  const changeScale=(value:Scale)=>{setScale(value);setSelected(null);};

  useEffect(()=>{
    if (autoRun && snapshot) runDraft(true);
  },[autoRun,snapshot,equipmentKind,machinesPerCall]);

  function runDraft(reuseExistingScope=false){
    if(!snapshot)return;
    setError(null);setSelected(null);
    try {
      const startDay=reuseExistingScope&&runScope?runScope.split(":")[0]:window.start;
      const endDay=reuseExistingScope&&runScope?runScope.split(":")[1]:window.end;
      const result=planFromRecords(snapshot,{
        horizonStartUtc:new Date(zonedMidnight(startDay,timeZone)).toISOString(),
        horizonEndUtc:new Date(zonedMidnight(endDay,timeZone)).toISOString(),
        equipmentType:equipmentKind,
        machinesPerCall
      });
      setRunResult(result);
      setRunScope(`${startDay}:${endDay}`);
      setLaneMode("berths");
    } catch(e){setError(e instanceof Error?e.message:"Unable to generate schedule");}
  }

  return <div className="pc-root">
    <div className="pc-heading">
      <div><div className="pc-kicker"><span className="pc-pulse"/> PORTPOWER AI / OPERATIONS CONTROL</div><h1>Planning calendar</h1><p>{port==="miami"?"PortMiami":"Port of Gulfport"} · One workspace for bookings, resources and optimization</p></div>
      <div className="pc-meta"><span className="pc-demo">MANAGER PLANS · NOT AIS</span><button className="pc-refresh" type="button" onClick={()=>setReload(n=>n+1)}>↻ Refresh data</button></div>
    </div>
    <div className="pc-toolbar">
      <div className="pc-date-nav"><button aria-label="Previous period" onClick={()=>move(-1)}>‹</button><button onClick={()=>{setCursor("2026-12-01");setSelected(null);}}>Dec 2026</button><button aria-label="Next period" onClick={()=>move(1)}>›</button><strong>{displayRange}</strong></div>
      <div className="pc-scale" role="group" aria-label="Calendar view">{(["day","week","month","year"] as Scale[]).map(v=><button key={v} className={scale===v?"active":""} onClick={()=>changeScale(v)} aria-pressed={scale===v}>{v[0].toUpperCase()+v.slice(1)}</button>)}</div>
    </div>
    {error&&<div className="pc-error" role="alert">{error}</div>}
    <div className="pc-metrics">
      <div><small>VESSEL CALLS IN VIEW</small><strong>{loading?"—":comparisonReady?visibleSlots.filter(x=>x.start>=window.startMs&&x.start<window.endMs).length:planningArrivals.length}</strong><span>{comparisonReady?"Scheduled calls":"Planned arrivals"}</span></div>
      <div><small>BERTHS READY</small><strong>{snapshot?`${snapshot.berths.filter(x=>x.availableForPlanning).length}/${snapshot.berths.length}`:"—"}</strong><span>Recorded status</span></div>
      <div><small>EQUIPMENT READY</small><strong>{snapshot?`${snapshot.equipment.filter(x=>x.availableForPlanning).length}/${snapshot.equipment.length}`:"—"}</strong><span>Recorded availability</span></div>
      <div><small>{previewAssumptions?"DRAFT UNSCHEDULED":"VISIBLE OVERLAPS"}</small><strong>{previewAssumptions?runResult!.unscheduled.length:overlaps.length}</strong><span>{previewAssumptions?"Proposed plan":"Indicative bookings only"}</span></div>
    </div>
    <div className="pc-board">
      <div className="pc-main-board">
        <div className="pc-board-header"><div><div className="pc-kicker">RESOURCE BOARD</div><h2>Traffic & capacity</h2><p>Air-traffic-style lanes · construction-style resource timeline</p></div><div className="pc-mode"><button className={laneMode==="berths"?"active":""} onClick={()=>setLaneMode("berths")}>Berths</button><button className={laneMode==="equipment"?"active":""} onClick={()=>setLaneMode("equipment")}>Equipment</button></div></div>
        <div className="pc-legend"><span><i className="pc-swatch incoming"/>Indicative window</span><span><i className="pc-swatch scheduled"/>Generated draft</span><span><i className="pc-swatch restricted"/>Restricted</span></div>
        {scale === "month" ? <div className="pc-month-grid">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div className="pc-weekday" key={d}>{d}</div>)}
          {Array.from({length:(weekday(window.start)+6)%7},(_,i)=><div className="pc-blank-day" key={`blank-${i}`}/>)}
          {columns.map(c=>{
            const calls=comparisonReady?visibleSlots.filter(s=>parts(new Date(s.start),timeZone)===c.key):planningArrivals.filter(a=>parts(new Date(a.plannedEta),timeZone)===c.key);
            return <button type="button" className={`pc-day-cell ${calls.length?"pc-day-active":""}`} key={c.key} onClick={()=>{setCursor(c.key);setScale("day");setSelected(null);}}>
              <span className="pc-day-number">{c.label}</span><small>{calls.length? `${calls.length} vessel${calls.length===1?"":"s"}` : "—"}</small>
              {calls.slice(0,2).map(a=><span className="pc-day-event" key={a.id}>{"name" in a ? a.name : a.vesselName??a.mmsi}</span>)}
              {calls.length>2&&<span className="pc-day-more">+{calls.length-2} more</span>}
            </button>;
          })}
        </div> : scale === "year" ? <div className="pc-year-grid">
          {columns.map((c,i)=>{
            const start=ymd(Number(window.start.slice(0,4)),i+1,1);
            const count=comparisonReady?visibleSlots.filter(s=>parts(new Date(s.start),timeZone).startsWith(start.slice(0,7))).length:allArrivals.filter(a=>parts(new Date(a.plannedEta),timeZone).startsWith(start.slice(0,7))).length;
            return <button type="button" className="pc-year-cell" key={c.key} onClick={()=>{setCursor(start);setScale("month");setSelected(null);}}>
              <span className="pc-year-month">{c.label}</span><strong>{count}</strong><small>planned calls</small>
              <span className="pc-year-meter"><span style={{width:`${Math.min(100,count/20*100)}%`}}/></span>
            </button>;
          })}
        </div> : <div className="pc-timeline-scroll"><div className="pc-timeline">
          <div className="pc-timeline-label pc-timeline-axis-title">RESOURCE / STATUS</div><div className="pc-axis">{columns.map(c=><div key={c.key}>{c.label}</div>)}</div>
          {loading?<div className="pc-timeline-message">Loading Render scheduling inputs…</div>:mappedRows.length===0?<div className="pc-timeline-message">No resources registered for this port.</div>:mappedRows.map(row=><div className="pc-lane" key={row.id}>
            <div className="pc-lane-label"><strong>{row.name}</strong><small className={row.active?"pc-state-ready":"pc-state-blocked"}>{row.detail}</small></div>
            <div className="pc-track">
              {columns.map(c=><span className="pc-gridline" key={c.key}/>)}
              {!row.active&&<span className="pc-track-disabled"/>}
              {row.bookings.map(s=>{
                const left=rowOffset(Math.max(s.start,window.startMs),window.startMs,window.endMs);
                const right=rowOffset(Math.min(s.end,window.endMs),window.startMs,window.endMs);
                return <button type="button" key={s.id} title={`${s.name}: ${displayDate(s.start,timeZone)} ${clock(s.start,timeZone)}–${clock(s.end,timeZone)}`} className={`pc-event ${s.simulated?"pc-scheduled":"pc-incoming"}`} style={{left:`${left}%`,width:`${Math.max(.5,right-left)}%`}} onClick={()=>setSelected(s)} aria-label={`Inspect ${s.name}`}><span>{s.name}</span></button>;
              })}
            </div>
          </div>)}
        </div></div>}
        {unassigned.length>0&&<div className="pc-unassigned">{unassigned.length} arrivals have no preferred berth. They do not appear in a berth lane until assigned.</div>}
        <div className="pc-board-footnote">{comparisonReady?"Green bars show the proposed schedule based on recorded ETAs and current resource status.":"Blue bars represent indicative ETA + service duration, not confirmed berth bookings."} Times displayed in {port==="miami"?"Eastern":"Central"} Time; all scenarios are read-only.</div>
      </div>
      <aside className="pc-optimizer">
        <div className="pc-optimizer-head"><span className="pc-ai-symbol">✦</span><div><div className="pc-kicker">SCHEDULING ENGINE</div><h2>Optimizer</h2></div><span className="pc-engine-tag">FCFS v1</span></div>
        <p className="pc-optimizer-summary">Uses registered vessel arrival times and the latest berth/equipment status from Render. Generates a conflict-aware FCFS draft; nothing is dispatched or saved automatically.</p>
        <div className="pc-optimizer-panel">
          <div className="pc-panel-label">LIVE PLANNING INPUTS</div>
          <div className="pc-source-row"><span>Vessel arrival times</span><strong>From Arrivals</strong></div>
          <div className="pc-source-row"><span>Equipment status</span><strong>From Equipment</strong></div>
          <div className="pc-source-row"><span>Berth status</span><strong>From Berths</strong></div>
          <div className="pc-resource-summary">
            <strong>{snapshot?.equipment.filter(e=>e.availableForPlanning).length??"—"} available machines</strong>
            <span>{snapshot?.equipment.filter(e=>!e.availableForPlanning).length??"—"} currently unavailable</span>
            <Link to={`/${port}/equipment`}>Manage equipment ↗</Link>
          </div>
          <div className="pc-resource-summary">
            <strong>{snapshot?.berths.filter(e=>e.availableForPlanning).length??"—"} available berths</strong>
            <Link to={`/${port}/berths`}>Manage berths ↗</Link>
          </div>
          <div className="pc-panel-label pc-outage-heading">DEMO ASSUMPTION · NOT STORED PER VESSEL</div>
          <p className="pc-scenario-note">We do not yet store which equipment each cargo operation requires. Select a temporary requirement for this draft. It does not change the recorded arrival times or asset statuses.</p>
          <label className="pc-field-label">Equipment type required per vessel
            <select value={equipmentKind} onChange={e=>{setEquipmentKind(e.target.value as SchedulingEquipmentType);resetResult();}}>
              {(["forklift","reach_stacker","mobile_crane","gantry_crane","terminal_tractor"] as SchedulingEquipmentType[]).map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
            </select>
          </label>
          <label className="pc-field-label pc-field-spaced">Machines of this type per vessel
            <select value={machinesPerCall} onChange={e=>{setMachinesPerCall(Number(e.target.value));resetResult();}}>
              {[1,2,3,4].map(n=><option key={n} value={n}>{n} machine{n>1?"s":""}</option>)}
            </select>
          </label>
          <button className="pc-run" type="button" onClick={()=>{runDraft(false);setAutoRun(true);}} disabled={!snapshot||loading}>✦ Generate schedule <span>↗</span></button>
          <small className="pc-no-write">Read-only preview · Refresh after updating Arrivals, Berths, or Equipment. No database writes.</small>
        </div>
        {previewAssumptions&&runResult&&<div className="pc-results">
          <div className="pc-panel-label">SCHEDULE RESULTS · RECORDED ETAS</div>
          <div className="pc-comparison">
            <div><small>SCHEDULED</small><strong>{runResult.metrics.scheduledCount}</strong><span>{runResult.metrics.delayedCount} start later than ETA</span></div>
            <div><small>UNSCHEDULED</small><strong>{runResult.metrics.unscheduledCount}</strong><span>No feasible slot in period</span></div>
          </div>
          <div className="pc-impact"><div><strong>{Math.round(runResult.metrics.averageWaitingMinutes)} min</strong><small>Average scheduled wait</small></div><div><strong>{Math.round(runResult.metrics.totalWaitingMinutes)} min</strong><small>Total scheduled wait</small></div></div>
          {runResult.assignments.filter(a=>a.waitingMinutes>0).length>0&&<><div className="pc-panel-label">DELAYED VESSEL CALLS</div><div className="pc-change-list">{runResult.assignments.filter(a=>a.waitingMinutes>0).slice(0,12).map(a=><div className="pc-change" key={a.arrivalId}><strong>{snapshot?.arrivals.find(x=>x.id===a.arrivalId)?.vesselName??a.mmsi}</strong><span>Starts {Math.round(a.waitingMinutes)} minutes after recorded ETA</span></div>)}</div></>}
          {runResult.unscheduled.length>0&&<><div className="pc-panel-label">COULD NOT SCHEDULE</div><div className="pc-unscheduled">{runResult.unscheduled.map(item=><div key={item.arrivalId}><strong>{snapshot?.arrivals.find(x=>x.id===item.arrivalId)?.vesselName??item.arrivalId}</strong><span>{item.reason}</span></div>)}</div></>}
          {runResult.metrics.delayedCount===0&&runResult.metrics.unscheduledCount===0&&<p className="pc-scenario-note">Every call fits at its recorded ETA under the chosen demo equipment requirement and currently available assets. This is not a claim of globally optimal scheduling.</p>}
        </div>}
        {!previewAssumptions&&<div className="pc-standby"><span>◷</span><strong>Ready to simulate</strong><p>Generate a draft from recorded arrival times, available berths, and available equipment.</p></div>}
        <div className="pc-caveat">Not certified for real-world port dispatch. Equipment type/count per vessel are demo assumptions; historical maintenance windows, shifts, and physical berth-fit data are not stored.</div>
      </aside>
    </div>
    {selected&&<div className="pc-inspector"><div><span className="pc-kicker">SELECTED VESSEL CALL</span><h3>{selected.name}</h3><p>{displayDate(selected.start)} · {clock(selected.start)} – {displayDate(selected.end)} · {clock(selected.end)}</p><p>{selected.note}</p><p>Berth: {snapshot?.berths.find(b=>b.id===selected.berthId)?.name??"Unassigned"} · Equipment: {selected.equipmentIds.length?selected.equipmentIds.map(id=>snapshot?.equipment.find(e=>e.id===id)?.code??id).join(", "):"Not assigned"}</p></div><button type="button" onClick={()=>setSelected(null)} aria-label="Close details">✕</button></div>}
    <footer className="pc-footer">One operational calendar · Data: authenticated Render planning snapshot · Draft scheduling engine: deterministic FCFS using recorded ETAs and statuses with explicit equipment requirement assumptions. No invented AIS arrivals or guaranteed optimality.</footer>
  </div>;
}
