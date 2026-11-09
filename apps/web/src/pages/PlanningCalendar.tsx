import { useEffect, useMemo, useState } from "react";
import type { SchedulingInputs, SchedulingEquipmentType } from "../../../../packages/core/dist/index.js";
import { compareScenario, type ScenarioComparison } from "../services/constraintScheduler";
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
  const [runResult,setRunResult] = useState<ScenarioComparison|null>(null);
  const [runScope,setRunScope] = useState<string|null>(null);
  const [assume,setAssume] = useState(false);
  const [equipmentKind,setEquipmentKind] = useState<SchedulingEquipmentType>("forklift");
  const [outageId,setOutageId] = useState("");
  const [outageDay,setOutageDay] = useState("2026-12-10");
  const [outageStartHour,setOutageStartHour] = useState(8);
  const [outageDuration,setOutageDuration] = useState(8);
  const [congestionCount,setCongestionCount] = useState(8);
  const [congestionDay,setCongestionDay] = useState("2026-12-10");
  const [machinesPerCall,setMachinesPerCall] = useState(2);
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
    if(runResult)return runResult.revised.assignments.map(a=>{
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
  const comparisonReady=runResult!==null && runScope!==null && window.startMs < zonedMidnight(runScope.split(":")[1]) && window.endMs > zonedMidnight(runScope.split(":")[0]);
  const movedIds=new Set(comparisonReady?runResult.changes.filter(c=>c.reason!=="Unchanged").map(c=>c.arrivalId):[]);
  const resourceRows=laneMode==="berths"?(snapshot?.berths??[]).map(b=>({id:b.id,name:b.name,detail:b.status,active:b.availableForPlanning})):
    (snapshot?.equipment??[]).map(e=>({id:e.id,name:e.code,detail:e.type.replaceAll("_"," "),active:e.availableForPlanning}));
  const baselineSlots:Slot[]=runResult?.baseline.assignments.map(a=>({id:a.arrivalId,name:snapshot?.arrivals.find(x=>x.id===a.arrivalId)?.vesselName??a.mmsi,berthId:a.berthId,start:Date.parse(a.serviceStartUtc),end:Date.parse(a.completionTimeUtc),equipmentIds:a.equipmentIds,simulated:false,note:"Baseline allocation before scenario"}))??[];
  const mappedRows=resourceRows.map(resource=>({...resource,bookings:visibleSlots.filter(s=>laneMode==="berths"?s.berthId===resource.id:s.equipmentIds.includes(resource.id)),baselineBookings:comparisonReady?baselineSlots.filter(s=>s.end>window.startMs&&s.start<window.endMs&&(laneMode==="berths"?s.berthId===resource.id:s.equipmentIds.includes(resource.id))):[]}));
  const unassigned=visibleSlots.filter(s=>laneMode==="berths"&&!s.berthId);
  const columns=selectCols(scale,window.start);
  const rowConflict=(a:Slot,b:Slot)=>a.id!==b.id&&a.start<b.end&&b.start<a.end;
  const overlaps=mappedRows.flatMap(r=>r.bookings.filter((s,i)=>r.bookings.slice(i+1).some(t=>rowConflict(s,t))));
  const previewAssumptions=comparisonReady;
  const resetResult=()=>{setRunResult(null);setRunScope(null);setSelected(null);};
  const move=(step:number)=>{
    setCursor(date=>scale==="day"?dateShift(date,step):scale==="week"?dateShift(date,7*step):scale==="month"?dateMonthShift(date,step):dateYearShift(date,step));
    setSelected(null);
  };
  const changeScale=(value:Scale)=>{setScale(value);setSelected(null);};

  function runDraft(){
    if(!snapshot || !assume)return;
    setError(null);setSelected(null);
    try{
      const localStamp=(day:string,hour:number)=>{
        const base=zonedMidnight(day);
        return new Date(base+hour*3600000).toISOString();
      };
      const outageStart = localStamp(outageDay,outageStartHour);
      const outageEnd = new Date(Date.parse(outageStart)+outageDuration*3600000).toISOString();
      const result=compareScenario(snapshot,{
        horizonStartUtc:new Date(window.startMs).toISOString(),
        horizonEndUtc:new Date(window.endMs).toISOString(),
        equipmentType:equipmentKind,
        machinesPerCall,
        congestionCount,
        congestionStartUtc:localStamp(congestionDay,8),
        outageEquipmentId:outageId,
        outageStartUtc:outageStart,
        outageEndUtc:outageEnd
      });
      setRunResult(result);setRunScope(`${window.start}:${window.end}`);setLaneMode("berths");
    }catch(e){setError(e instanceof Error?e.message:"Unable to run scheduling draft");}
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
      <div><small>VESSEL CALLS IN VIEW</small><strong>{loading?"—":comparisonReady?visibleSlots.filter(x=>x.start>=window.startMs&&x.start<window.endMs).length:planningArrivals.length}</strong><span>{comparisonReady?"Revised scheduled calls":"Planned arrivals"}</span></div>
      <div><small>BERTHS READY</small><strong>{snapshot?`${snapshot.berths.filter(x=>x.availableForPlanning).length}/${snapshot.berths.length}`:"—"}</strong><span>Recorded status</span></div>
      <div><small>EQUIPMENT READY</small><strong>{snapshot?`${snapshot.equipment.filter(x=>x.availableForPlanning).length}/${snapshot.equipment.length}`:"—"}</strong><span>Recorded availability</span></div>
      <div><small>{previewAssumptions?"DRAFT UNSCHEDULED":"VISIBLE OVERLAPS"}</small><strong>{previewAssumptions?runResult!.revised.unscheduled.length:overlaps.length}</strong><span>{previewAssumptions?"Proposed plan":"Indicative bookings only"}</span></div>
    </div>
    <div className="pc-board">
      <div className="pc-main-board">
        <div className="pc-board-header"><div><div className="pc-kicker">RESOURCE BOARD</div><h2>Traffic & capacity</h2><p>Air-traffic-style lanes · construction-style resource timeline</p></div><div className="pc-mode"><button className={laneMode==="berths"?"active":""} onClick={()=>setLaneMode("berths")}>Berths</button><button className={laneMode==="equipment"?"active":""} onClick={()=>setLaneMode("equipment")}>Equipment</button></div></div>
        <div className="pc-legend"><span><i className="pc-swatch incoming"/>Indicative window</span><span><i className="pc-swatch scheduled"/>Revised draft</span><span><i className="pc-swatch baseline"/>Original plan</span><span><i className="pc-swatch restricted"/>Restricted</span></div>
        {scale === "month" ? <div className="pc-month-grid">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div className="pc-weekday" key={d}>{d}</div>)}
          {Array.from({length:(weekday(window.start)+6)%7},(_,i)=><div className="pc-blank-day" key={`blank-${i}`}/>)}
          {columns.map(c=>{
            const calls=comparisonReady?visibleSlots.filter(s=>parts(new Date(s.start))===c.key):planningArrivals.filter(a=>parts(new Date(a.plannedEta))===c.key);
            return <button type="button" className={`pc-day-cell ${calls.length?"pc-day-active":""}`} key={c.key} onClick={()=>{setCursor(c.key);setScale("day");setSelected(null);}}>
              <span className="pc-day-number">{c.label}</span><small>{calls.length? `${calls.length} vessel${calls.length===1?"":"s"}` : "—"}</small>
              {calls.slice(0,2).map(a=><span className="pc-day-event" key={a.id}>{"name" in a ? a.name : a.vesselName??a.mmsi}</span>)}
              {calls.length>2&&<span className="pc-day-more">+{calls.length-2} more</span>}
            </button>;
          })}
        </div> : scale === "year" ? <div className="pc-year-grid">
          {columns.map((c,i)=>{
            const start=ymd(Number(window.start.slice(0,4)),i+1,1);
            const count=comparisonReady?visibleSlots.filter(s=>parts(new Date(s.start)).startsWith(start.slice(0,7))).length:allArrivals.filter(a=>parts(new Date(a.plannedEta)).startsWith(start.slice(0,7))).length;
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
              {row.baselineBookings.map(s=>{
                const left=rowOffset(Math.max(s.start,window.startMs),window.startMs,window.endMs);
                const right=rowOffset(Math.min(s.end,window.endMs),window.startMs,window.endMs);
                return <span key={`baseline-${s.id}`} title={`Before: ${s.name} ${displayDate(s.start)} ${clock(s.start)}`} className="pc-baseline-ghost" style={{left:`${left}%`,width:`${Math.max(.5,right-left)}%`}}/>;
              })}
              {row.bookings.map(s=>{
                const left=rowOffset(Math.max(s.start,window.startMs),window.startMs,window.endMs);
                const right=rowOffset(Math.min(s.end,window.endMs),window.startMs,window.endMs);
                return <button type="button" key={s.id} title={`${s.name}: ${displayDate(s.start)} ${clock(s.start)}–${clock(s.end)}`} className={`pc-event ${s.simulated?"pc-scheduled":"pc-incoming"} ${movedIds.has(s.id)?"pc-moved":""}`} style={{left:`${left}%`,width:`${Math.max(.5,right-left)}%`}} onClick={()=>setSelected(s)} aria-label={`Inspect ${s.name}`}><span>{s.name}</span></button>;
              })}
            </div>
          </div>)}
        </div></div>}
        {unassigned.length>0&&<div className="pc-unassigned">{unassigned.length} arrivals have no preferred berth. They do not appear in a berth lane until assigned.</div>}
        <div className="pc-board-footnote">{comparisonReady?"Green bars show the revised schedule under your scenario. Open Day or Week to inspect changed vessel times.":"Blue bars represent indicative ETA + service duration, not confirmed berth bookings."} Times displayed in Eastern Time; all scenarios are read-only.</div>
      </div>
      <aside className="pc-optimizer">
        <div className="pc-optimizer-head"><span className="pc-ai-symbol">✦</span><div><div className="pc-kicker">SCHEDULING ENGINE</div><h2>Optimizer</h2></div><span className="pc-engine-tag">FCFS v1</span></div>
        <p className="pc-optimizer-summary">Create a berth- and equipment-constrained schedule draft for the displayed calendar period. Nothing is dispatched or saved automatically.</p>
        <div className="pc-optimizer-panel">
          <div className="pc-panel-label">SCENARIO INPUTS</div>
          <label className="pc-field-label">Required equipment per vessel<select value={equipmentKind} onChange={e=>{setEquipmentKind(e.target.value as SchedulingEquipmentType);setOutageId("");resetResult();}}>
            {(["forklift","reach_stacker","mobile_crane","gantry_crane","terminal_tractor"] as SchedulingEquipmentType[]).map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
          <div className="pc-panel-label pc-outage-heading">CONGESTION TEST</div>
          <p className="pc-scenario-note">Move the earliest vessel calls in this calendar period to one shared arrival time. The original dates remain unchanged in Render.</p>
          <label className="pc-field-label">Vessels arriving together
            <select value={congestionCount} onChange={e=>{setCongestionCount(Number(e.target.value));resetResult();}}>
              {[0,2,4,6,8,10,12,16,20].map(n=><option key={n} value={n}>{n===0?"No congestion":`${n} vessels simultaneously`}</option>)}
            </select>
          </label>
          <label className="pc-field-label pc-field-spaced">Congestion day
            <input type="date" value={congestionDay} onChange={e=>{setCongestionDay(e.target.value);resetResult();}}/>
          </label>
          <label className="pc-field-label pc-field-spaced">Machines needed per vessel
            <select value={machinesPerCall} onChange={e=>{setMachinesPerCall(Number(e.target.value));resetResult();}}>
              {[1,2,3,4].map(n=><option key={n} value={n}>{n} machine{n>1?"s":""}</option>)}
            </select>
          </label>
          <div className="pc-panel-label pc-outage-heading">TIMED EQUIPMENT OUTAGE</div>
          <label className="pc-field-label">Affected machine
            <select value={outageId} onChange={e=>{setOutageId(e.target.value);resetResult();}}>
              <option value="">No outage</option>
              {(snapshot?.equipment??[]).filter(e=>e.availableForPlanning&&e.type===equipmentKind).map(e=><option key={e.id} value={e.id}>{e.code} · {e.energyType??"Unknown energy"}</option>)}
            </select>
          </label>
          <label className="pc-field-label pc-field-spaced">Outage date
            <input type="date" value={outageDay} disabled={!outageId} onChange={e=>{setOutageDay(e.target.value);resetResult();}}/>
          </label>
          <div className="pc-field-pair">
            <label className="pc-field-label">Starts at
              <select value={outageStartHour} disabled={!outageId} onChange={e=>{setOutageStartHour(Number(e.target.value));resetResult();}}>
                {Array.from({length:24},(_,i)=><option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}
              </select>
            </label>
            <label className="pc-field-label">Duration
              <select value={outageDuration} disabled={!outageId} onChange={e=>{setOutageDuration(Number(e.target.value));resetResult();}}>
                {[2,4,6,8,12,24].map(n=><option key={n} value={n}>{n} hours</option>)}
              </select>
            </label>
          </div>
          <div className="pc-scenario-banner">Simulation only · Selected asset is unavailable for its specified outage window, not the entire month.</div>
          <label className="pc-confirm"><input type="checkbox" checked={assume} onChange={e=>{setAssume(e.target.checked);resetResult();}}/><span>I understand this is a <strong>simulation</strong>. Equipment requirements, congestion and timed outages are what-if assumptions. Recorded resource status is assumed constant outside outage windows.</span></label>
          <button className="pc-run" type="button" onClick={runDraft} disabled={!snapshot||!assume||loading}>✦ Run draft optimization <span>↗</span></button>
          <small className="pc-no-write">Read-only calculation. No Render schedule writes.</small>
        </div>
        {previewAssumptions&&runResult&&<div className="pc-results">
          <div className="pc-panel-label">BEFORE / AFTER · DRAFT</div>
          <div className="pc-comparison">
            <div><small>BEFORE · RECORDED ETAS</small><strong>{runResult.baseline.metrics.scheduledCount} / {runResult.baseline.metrics.scheduledCount+runResult.baseline.metrics.unscheduledCount}</strong><span>Avg wait {Math.round(runResult.baseline.metrics.averageWaitingMinutes)} min</span></div>
            <div><small>AFTER · YOUR SCENARIO</small><strong>{runResult.revised.metrics.scheduledCount} / {runResult.revised.metrics.scheduledCount+runResult.revised.metrics.unscheduledCount}</strong><span>Avg wait {Math.round(runResult.revised.metrics.averageWaitingMinutes)} min</span></div>
          </div>
          <div className="pc-impact"><div><strong>{runResult.changes.filter(c=>c.reason!=="Unchanged").length}</strong><small>Changed assignments</small></div><div><strong>{runResult.revised.metrics.unscheduledCount}</strong><small>Unscheduled</small></div></div>
          <div className="pc-panel-label">WHY THE PLAN CHANGED</div>
          <div className="pc-change-list">
            {runResult.changes.filter(c=>c.reason!=="Unchanged").slice(0,10).map(c=>{
              const arrival=snapshot?.arrivals.find(a=>a.id===c.arrivalId);
              return <div className="pc-change" key={c.arrivalId}>
                <strong>{arrival?.vesselName??c.arrivalId}</strong>
                <span>{c.reason}{c.deltaMinutes!==null && c.deltaMinutes!==0 ? ` · ${c.deltaMinutes>0?"+":""}${Math.round(c.deltaMinutes)} min vs baseline`:""}</span>
              </div>;
            })}
            {runResult.changes.every(c=>c.reason==="Unchanged")&&<p className="pc-scenario-note">No change under these assumptions. Increase simultaneous arrivals, equipment per vessel, or select an outage affecting a busy window.</p>}
          </div>
          {runResult.revised.unscheduled.length>0&&<div className="pc-unscheduled">{runResult.revised.unscheduled.map(item=><div key={item.arrivalId}><strong>{snapshot?.arrivals.find(x=>x.id===item.arrivalId)?.vesselName??item.arrivalId}</strong><span>{item.reason}</span></div>)}</div>}
        </div>}
        {!previewAssumptions&&<div className="pc-standby"><span>◷</span><strong>Ready to simulate</strong><p>Select assumptions and run a draft to compare available berth/equipment resources against arriving vessels.</p></div>}
        <div className="pc-caveat">Not certified for real-world port dispatch. Actual shifts, cargo requirements, vessel dimensions, maintenance windows and fuel calculations are not in the current dataset.</div>
      </aside>
    </div>
    {selected&&<div className="pc-inspector"><div><span className="pc-kicker">SELECTED VESSEL CALL</span><h3>{selected.name}</h3><p>{displayDate(selected.start)} · {clock(selected.start)} – {displayDate(selected.end)} · {clock(selected.end)}</p><p>{selected.note}</p><p>Berth: {snapshot?.berths.find(b=>b.id===selected.berthId)?.name??"Unassigned"} · Equipment: {selected.equipmentIds.length?selected.equipmentIds.map(id=>snapshot?.equipment.find(e=>e.id===id)?.code??id).join(", "):"Not assigned"}</p></div><button type="button" onClick={()=>setSelected(null)} aria-label="Close details">✕</button></div>}
    <footer className="pc-footer">One operational calendar · Data: authenticated Render planning snapshot · Draft scheduling engine: deterministic FCFS with explicit assumptions. No invented AIS arrivals or guaranteed optimality.</footer>
  </div>;
}
