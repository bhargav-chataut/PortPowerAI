import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { PortCode } from "../services/authApi";
import { BERTH_STATUSES, getBerths, updateBerth, parseBerthCapacity, type ManagedBerth, type BerthStatus } from "../services/berthApi";
import "./BerthManagementPage.css";

function BerthEditor({ berth, onSaved }: { berth: ManagedBerth; onSaved: (berth: ManagedBerth) => void }) {
  const [status, setStatus] = useState<BerthStatus>(berth.status);
  const [length, setLength] = useState(String(berth.max_length_m ?? ""));
  const [draft, setDraft] = useState(String(berth.max_draft_m ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = status !== berth.status || length !== String(berth.max_length_m ?? "") || draft !== String(berth.max_draft_m ?? "");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSaved(false);
    try {
      const max_length_m = parseBerthCapacity(length, 99999999.99);
      const max_draft_m = parseBerthCapacity(draft, 999999.99);
      setSaving(true);
      const result = await updateBerth(berth.id, { status, max_length_m, max_draft_m });
      onSaved(result); setStatus(result.status);
      setLength(String(result.max_length_m ?? "")); setDraft(String(result.max_draft_m ?? ""));
      setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save berth."); }
    finally { setSaving(false); }
  }

  return <article className="berth-card">
    <header><div><p>Berth {berth.berth_number}</p><h2>{berth.name}</h2></div>
      <span className={`berth-status berth-status-${berth.status}`}>{berth.status}</span></header>
    <form onSubmit={event => void save(event)}>
      <fieldset disabled={saving}>
        <legend className="sr-only">Edit {berth.name}</legend>
        <label htmlFor={`status-${berth.id}`}>Status</label>
        <select id={`status-${berth.id}`} value={status} onChange={e => { setStatus(e.target.value as BerthStatus); setSaved(false); }}>
          {BERTH_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <label htmlFor={`length-${berth.id}`}>Maximum vessel length (m)</label>
        <input id={`length-${berth.id}`} type="number" step="0.01" min="0.01" max="99999999.99" placeholder="Unknown" value={length} onChange={e => { setLength(e.target.value); setSaved(false); }} />
        <label htmlFor={`draft-${berth.id}`}>Maximum vessel draft (m)</label>
        <input id={`draft-${berth.id}`} type="number" step="0.01" min="0.01" max="999999.99" placeholder="Unknown" value={draft} onChange={e => { setDraft(e.target.value); setSaved(false); }} />
        <p className="berth-help">Leave capacity blank if unknown. No dimensions are inferred from AIS.</p>
        <button type="submit" disabled={saving || !dirty}>{saving ? "Saving…" : "Save berth"}</button>
      </fieldset>
      {error && <p role="alert" className="berth-error">{error}</p>}
      {saved && <p role="status">Saved to PostgreSQL.</p>}
    </form>
  </article>;
}

export default function BerthManagementPage({ port }: { port: PortCode }) {
  // Region-keyed content prevents a previous port's data/forms from flashing.
  return <PortBerths key={port} port={port} />;
}

function PortBerths({ port }: { port: PortCode }) {
  const [berths, setBerths] = useState<ManagedBerth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    getBerths(controller.signal).then(result => { if (!controller.signal.aborted) setBerths(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load berths."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  return <main className="berth-page">
    <nav aria-label="Dashboard navigation">
      <Link to={`/${port}`}>Map</Link><Link to={`/${port}/vessels`}>Vessel List</Link>
      <Link to={`/${port}/equipment`}>Equipment</Link><Link to={`/${port}/arrivals`}>Vessel Arrivals</Link>
      <Link to={`/${port}/berths`} aria-current="page">Berths</Link>
    </nav>
    <h1>Berth Management</h1><p>{port === "gulfport" ? "Port of Gulfport" : "PortMiami"} · assigned-port inventory</p>
    <p>Review berth status and known vessel limits. These are planning records, not verified port-authority specifications or real-time AIS occupancy. Demonstration values are assumptions.</p>
    {loading && <p role="status">Loading berths…</p>}
    {error && <div role="alert"><p className="berth-error">{error}</p><Link to="/login">Sign in</Link>{" "}<button onClick={() => setRetry(v => v + 1)}>Retry</button></div>}
    {!loading && !error && <>
      <p>{berths.length} berths registered. Each berth saves separately.</p>
      {berths.length === 0 ? <section><h2>No berths registered</h2><p>No berth records are available for your assigned port. Contact your administrator to register them.</p></section> :
        <div className="berth-grid">{berths.map(berth => <BerthEditor key={String(berth.id)} berth={berth} onSaved={saved => setBerths(rows => rows.map(row => String(row.id) === String(saved.id) ? saved : row))} />)}</div>}
    </>}
  </main>;
}
