import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  berthStatus, equipmentStatus, equipmentWorkload, detectOperationsConflicts, validateOperatingScenario,
  formatMinute, type OperatingScenario,
} from "../../../../packages/core/dist/index.js";
import { loadOperations, saveOperations, loadBrowserScenario, saveBrowserScenario } from "../services/operationsApi";

function TimeSelect({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const minutes = [...new Set([...Array.from({ length: 97 }, (_, i) => i * 15), value])].sort((a, b) => a - b);
  return <select aria-label={label} value={value} onChange={e => onChange(Number(e.target.value))}>
    {minutes.map(m => <option key={m} value={m}>{formatMinute(m)}</option>)}
  </select>;
}

function TimelineBar({ name, start, end, danger }: { name: string; start: number; end: number; danger: boolean }) {
  return <div className="ops-timeline-row">
    <span>{name}<small>{formatMinute(start)}–{formatMinute(end)}</small></span>
    <div className="ops-track"><div className={`ops-bar ${danger ? "ops-bar-conflict" : ""}`}
      style={{ left: `${start / 1440 * 100}%`, width: `${(end - start) / 1440 * 100}%` }}
      title={`${name}: ${formatMinute(start)}–${formatMinute(end)}`} /></div>
  </div>;
}

export default function OperationsDashboard() {
  const [scenario, setScenario] = useState<OperatingScenario | null>(null);
  const [mode, setMode] = useState<"postgres" | "browser">("postgres");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [at, setAt] = useState(600);

  useEffect(() => {
    const controller = new AbortController();
    loadOperations(controller.signal).then(result => {
      if (!controller.signal.aborted) setScenario(result.scenario);
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load operating scenario.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function reload() {
    if (dirty && !window.confirm("Discard unsaved edits and reload the saved scenario?")) return;
    setLoading(true); setError(null); setNotice("");
    try {
      setScenario(mode === "postgres" ? (await loadOperations()).scenario : loadBrowserScenario());
      setDirty(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to reload."); }
    finally { setLoading(false); }
  }

  function useBrowser() {
    try {
      setScenario(loadBrowserScenario()); setMode("browser"); setDirty(false); setError(null);
      setNotice("Offline demo loaded. Saves stay in this browser and do not update PostgreSQL.");
    } catch (err) { setError(err instanceof Error ? err.message : "Browser storage is unavailable."); }
  }

  function edit(update: (s: OperatingScenario) => OperatingScenario) {
    setScenario(s => s ? update(s) : s); setDirty(true); setNotice("");
  }

  async function save() {
    if (!scenario) return;
    setSaving(true); setError(null); setNotice("");
    try {
      const saved = mode === "postgres" ? (await saveOperations(scenario)).scenario : saveBrowserScenario(scenario);
      setScenario(saved); setDirty(false);
      setNotice(`Revision ${saved.revision} saved ${mode === "postgres" ? "to PostgreSQL" : "in this browser only"}.${detectOperationsConflicts(saved).length ? " This draft still contains scheduling conflicts." : ""}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed. Your edits remain on screen."); }
    finally { setSaving(false); }
  }

  const issues = scenario ? validateOperatingScenario(scenario) : [];
  const conflicts = scenario && !issues.length ? detectOperationsConflicts(scenario) : [];
  const conflictIds = new Set(conflicts.flatMap(c => c.entityIds));
  const taskMinutes = scenario?.tasks.reduce((sum, t) => sum + (Number.isFinite(t.duration) ? t.duration : 0), 0) ?? 0;

  return <main className="operations-page">
    <header>
      <nav className="ops-nav" aria-label="Application navigation">
        <Link to="/gulfport">Gulfport AIS</Link><Link to="/miami">Miami AIS</Link>
        <Link to="/operations" aria-current="page">Port operations</Link>
      </nav>
      <h1>Port Operations</h1>
      <p>Fictional Gulfport terminal · daily planning workspace</p>
      <div className="ops-disclaimer"><strong>SIMULATED SCENARIO — ALL OPERATING DATA IS FICTIONAL.</strong>
        <p>Berths, vessel calls, cargo tasks, durations, priorities and equipment are demo assumptions.
          No port authority supplied these records. They are separate from live AIS and do not dispatch equipment.</p>
      </div>
    </header>

    {loading && <p role="status">Loading the fictional operations plan…</p>}
    {error && <div className="ops-error" role="alert"><strong>{error}</strong>
      <p>Unsaved edits remain on screen. Reload to retrieve the saved revision.</p>
      {!scenario && <button onClick={useBrowser}>Use offline fictional demo</button>}
    </div>}
    {notice && <p role="status" className="ops-notice">{notice}</p>}
    {!loading && !scenario && <button onClick={() => void reload()}>Retry database connection</button>}

    {scenario && <>
      <section className="ops-toolbar">
        <div><strong>{mode === "postgres" ? "PostgreSQL scenario" : "OFFLINE DEMO · browser storage only"}</strong>
          <p>Revision {scenario.revision} · {dirty ? "Unsaved changes" : "Saved assumptions"} · {conflicts.length ? "Draft with conflicts" : issues.length ? "Invalid draft" : "No modeled scheduling conflicts"}</p></div>
        <div className="ops-actions">
          <button disabled={loading || saving} onClick={() => void reload()}>Reload saved plan</button>
          <button className="ops-primary" disabled={!dirty || saving || loading || issues.length > 0} onClick={() => void save()}>{saving ? "Saving…" : "Save scenario draft"}</button>
        </div>
      </section>

      <fieldset className="ops-editor" disabled={saving || loading}>
        <legend className="sr-only">Edit fictional operating assumptions</legend>
        <section>
          <h2>Planning day</h2>
          <label>Scenario name <input value={scenario.name} maxLength={160} onChange={e => edit(s => ({ ...s, name: e.target.value }))} /></label>
          <div className="ops-clock"><label htmlFor="ops-clock">Inspect availability at <strong>{formatMinute(at)}</strong></label>
            <input id="ops-clock" type="range" min="0" max="1440" step="15" value={at} onChange={e => setAt(Number(e.target.value))} /></div>
          <p>One fictional day, 00:00–24:00. Times use the scenario clock, not live time or AIS arrival predictions. Assignments ending at a time release the resource at that time.</p>
          <div className="ops-stats">
            <span><strong>{scenario.vessels.length}</strong> planned vessel calls</span>
            <span><strong>{scenario.tasks.length}</strong> cargo tasks</span>
            <span><strong>{taskMinutes}</strong> task-minutes (parallel work included)</span>
            <span><strong>{conflicts.length}</strong> conflicts</span>
          </div>
        </section>

        {(issues.length > 0 || conflicts.length > 0) && <section className="ops-warning" aria-live="polite">
          <h2>{issues.length ? "Check operating assumptions" : "Scheduling conflicts — draft requires changes"}</h2>
          <ul>{issues.map((issue, i) => <li key={`i${i}`}>{issue}</li>)}
            {conflicts.map((c, i) => <li key={`c${i}`}>{c.message}</li>)}</ul>
          <p>Conflicting schedules can be stored as drafts. Resolve warnings before treating the plan as usable. Checks cover only the modeled assignments, not navigational or engineering safety.</p>
        </section>}

        <section>
          <h2>Berth availability at {formatMinute(at)}</h2>
          <p>“Scheduled” means a later vessel call is planned. “Available” means no current or later booking in this scenario.</p>
          <div className="ops-berths">{scenario.berths.map(b => <article className="ops-berth" key={b.id}>
            <label>Berth name <input aria-label={`Name of ${b.name}`} value={b.name} onChange={e => edit(s => ({ ...s, berths: s.berths.map(x => x.id === b.id ? { ...x, name: e.target.value } : x) }))} /></label>
            <span className={`ops-status ${berthStatus(scenario, b.id, at)}`}>{berthStatus(scenario, b.id, at)}</span>
            {conflictIds.has(b.id) && <strong className="ops-conflict-text">Conflicting bookings</strong>}
            <ul>{scenario.vessels.filter(v => v.berthId === b.id).sort((a, z) => a.arrival - z.arrival).map(v => <li key={v.id}>{v.name}: {formatMinute(v.arrival)}–{formatMinute(v.departure)}</li>)}</ul>
          </article>)}</div>
        </section>

        <section>
          <h2>Simulated arrivals & planned departures</h2>
          <div className="ops-table"><table><thead><tr><th>Fictional vessel</th><th>Assigned berth</th><th>Arrival</th><th>Departure</th></tr></thead>
            <tbody>{scenario.vessels.map(v => <tr key={v.id} className={conflictIds.has(v.id) ? "ops-conflict-row" : ""}>
              <td><input aria-label={`Vessel name ${v.id}`} value={v.name} onChange={e => edit(s => ({ ...s, vessels: s.vessels.map(x => x.id === v.id ? { ...x, name: e.target.value } : x) }))} /></td>
              <td><select aria-label={`Berth for ${v.name}`} value={v.berthId} onChange={e => edit(s => ({ ...s, vessels: s.vessels.map(x => x.id === v.id ? { ...x, berthId: e.target.value } : x) }))}>{scenario.berths.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
              <td><TimeSelect label={`Arrival of ${v.name}`} value={v.arrival} onChange={arrival => edit(s => ({ ...s, vessels: s.vessels.map(x => x.id === v.id ? { ...x, arrival } : x) }))} /></td>
              <td><TimeSelect label={`Departure of ${v.name}`} value={v.departure} onChange={departure => edit(s => ({ ...s, vessels: s.vessels.map(x => x.id === v.id ? { ...x, departure } : x) }))} /></td>
            </tr>)}</tbody></table></div>
          {!scenario.vessels.length && <p>No vessel calls planned.</p>}
        </section>

        <section>
          <h2>Cargo-handling workload</h2>
          <p>Duration is assumed elapsed task time in minutes. Each selected equipment item is reserved for the whole task; priority does not automatically reschedule work.</p>
          <div className="ops-table"><table><thead><tr><th>Task</th><th>Vessel call</th><th>Start</th><th>Duration (min)</th><th>Priority</th><th>Required type</th><th>Assigned equipment</th></tr></thead>
            <tbody>{scenario.tasks.map(task => {
              const update = (changes: Partial<typeof task>) => edit(s => ({ ...s, tasks: s.tasks.map(x => x.id === task.id ? { ...x, ...changes } : x) }));
              return <tr key={task.id} className={conflictIds.has(task.id) ? "ops-conflict-row" : ""}>
                <td><input aria-label={`Task name ${task.id}`} value={task.name} onChange={e => update({ name: e.target.value })} /></td>
                <td><select aria-label={`Vessel for ${task.name}`} value={task.vesselId} onChange={e => update({ vesselId: e.target.value })}>{scenario.vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></td>
                <td><TimeSelect label={`Start of ${task.name}`} value={task.start} onChange={start => update({ start })} /></td>
                <td><input className="ops-duration" type="number" min="1" max="1440" aria-label={`Duration of ${task.name} in minutes`} value={Number.isFinite(task.duration) ? task.duration : ""} onChange={e => update({ duration: e.target.value === "" ? NaN : Number(e.target.value) })} /></td>
                <td><select aria-label={`Priority of ${task.name}`} value={task.priority} onChange={e => update({ priority: e.target.value as typeof task.priority })}>{["high", "normal", "low"].map(p => <option key={p}>{p}</option>)}</select></td>
                <td><select aria-label={`Required equipment type for ${task.name}`} value={task.requiredKind} onChange={e => update({ requiredKind: e.target.value as typeof task.requiredKind })}><option value="forklift">Forklift</option><option value="yard-tractor">Yard tractor</option></select></td>
                <td><div className="ops-equipment-checks">{scenario.equipment.map(e => <label key={e.id}><input type="checkbox" checked={task.equipmentIds.includes(e.id)} onChange={event => update({ equipmentIds: event.target.checked ? [...task.equipmentIds, e.id] : task.equipmentIds.filter(id => id !== e.id) })} />{e.name}</label>)}</div></td>
              </tr>;
            })}</tbody></table></div>
          {!scenario.tasks.length && <p>No cargo-handling tasks planned.</p>}
        </section>

        <section>
          <h2>Equipment availability at {formatMinute(at)}</h2>
          <p>Assigned minutes total the tasks reserved for each item. Overlapping tasks are counted separately and flagged as conflicts; these totals are workload assumptions, not measured throughput.</p>
          <div className="ops-table"><table><thead><tr><th>Equipment</th><th>Type</th><th>In service</th><th>Available from</th><th>Until</th><th>Status now</th><th>Day workload</th></tr></thead>
            <tbody>{scenario.equipment.map(e => {
              const update = (changes: Partial<typeof e>) => edit(s => ({ ...s, equipment: s.equipment.map(x => x.id === e.id ? { ...x, ...changes } : x) }));
              return <tr key={e.id} className={conflictIds.has(e.id) ? "ops-conflict-row" : ""}>
                <td><input aria-label={`Equipment name ${e.id}`} value={e.name} onChange={event => update({ name: event.target.value })} /></td>
                <td>{e.kind === "forklift" ? "Forklift" : "Yard tractor"}</td>
                <td><input type="checkbox" aria-label={`${e.name} in service`} checked={e.enabled} onChange={event => update({ enabled: event.target.checked })} /></td>
                <td><TimeSelect label={`${e.name} available from`} value={e.availableFrom} onChange={availableFrom => update({ availableFrom })} /></td>
                <td><TimeSelect label={`${e.name} available until`} value={e.availableUntil} onChange={availableUntil => update({ availableUntil })} /></td>
                <td><span className={`ops-status ${equipmentStatus(scenario, e.id, at)}`}>{equipmentStatus(scenario, e.id, at)}</span></td>
                <td>{issues.length ? "Check inputs" : `${equipmentWorkload(scenario, e.id).assignedMinutes} min · ${equipmentWorkload(scenario, e.id).taskCount} tasks`}</td>
              </tr>;
            })}</tbody></table></div>
          {!scenario.equipment.length && <p>No equipment is listed. Cargo tasks require equipment assignments.</p>}
        </section>

        <section>
          <h2>Port operations timeline</h2>
          <p>Vessel bars reserve berths; cargo bars reserve their assigned equipment. Red bars identify records involved in conflicts. The tables above provide exact times.</p>
          {issues.length ? <p>Correct invalid inputs to update the timeline.</p> : <div className="ops-timeline">
            <div className="ops-timeline-row ops-axis"><span>Scenario clock</span><div><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div>
            {scenario.vessels.map(v => <TimelineBar key={v.id} name={`${scenario.berths.find(b => b.id === v.berthId)?.name} · ${v.name}`} start={v.arrival} end={v.departure} danger={conflictIds.has(v.id)} />)}
            {scenario.tasks.map(t => <TimelineBar key={t.id} name={`${t.name} (${t.priority})`} start={t.start} end={t.start + t.duration} danger={conflictIds.has(t.id)} />)}
            {!scenario.vessels.length && !scenario.tasks.length && <p>No planned activity on this day.</p>}
          </div>}
        </section>
      </fieldset>
    </>}
  </main>;
}
