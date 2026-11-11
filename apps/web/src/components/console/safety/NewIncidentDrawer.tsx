'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { CATEGORY_LABEL, SEVERITY_LABEL, type Severity } from '@/lib/safety';
import { Drawer } from '@/components/console/ui';

/**
 * Open an incident by hand: something a call, a message or a colleague
 * reported that no SOS, ticket or detector raised. If the trip already has
 * an open incident the server joins it and says so.
 */
export function NewIncidentDrawer({
  onClose, onCreated,
}: {
  onClose: () => void; onCreated: (id: number, created: boolean) => void;
}) {
  const [category, setCategory] = useState('other');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [title, setTitle] = useState('');
  const [tripId, setTripId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tripOk = tripId.trim() === '' || /^\d+$/.test(tripId.trim());
  const ready = !busy && title.trim() !== '' && tripOk;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ id: number; created: boolean }>('/safety/admin/incidents/', {
        category, severity, title: title.trim(), note: note.trim(),
        ...(tripId.trim() ? { trip_id: Number(tripId) } : {}),
      });
      onCreated(r.id, r.created);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title="Open an incident"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={!ready} onClick={() => void submit()}>
            {busy ? 'Working…' : 'Open incident'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        <div className="ops-confirm">
          <b>Open an incident</b>
          <span>Use this for something reported to you that no alarm, ticket or detector raised. Do not put phone numbers or addresses in the title.</span>
        </div>
        <label className="ops-form__label" htmlFor="ni-title">Title (required)</label>
        <input id="ni-title" className="ops-select" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <div className="ops-form__row">
          <label className="ops-form__label" htmlFor="ni-cat">Category</label>
          <select id="ni-cat" className="ops-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="ops-form__label" htmlFor="ni-sev">Severity</label>
          <select id="ni-sev" className="ops-select" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
          </select>
          <label className="ops-form__label" htmlFor="ni-trip">Trip number (optional)</label>
          <input id="ni-trip" className="ops-select" inputMode="numeric" value={tripId} onChange={(e) => setTripId(e.target.value)} size={10} aria-invalid={!tripOk} />
        </div>
        <label className="ops-form__label" htmlFor="ni-note">What was reported</label>
        <textarea id="ni-note" className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
