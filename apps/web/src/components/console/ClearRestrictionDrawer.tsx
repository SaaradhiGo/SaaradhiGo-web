'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { NOTE_MAX, NOTE_MIN } from '@/lib/fraud';
import { Drawer } from '@/components/console/ui';

/**
 * Clear a rider's online-payment-only restriction (AUDIT 27.56). `rider.block` is the capability that
 * sets and clears the restrictions on the Riders page. Cash is available to the rider again at once;
 * the note is kept in the audit log. Blocking is a different action and is not touched.
 */
export function ClearRestrictionDrawer({
  riderId, riderName, onClose, onDone,
}: { riderId: number; riderName: string; onClose: () => void; onDone: (text: string, kind: 'done') => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = note.trim();
  const problem = trimmed.length < NOTE_MIN ? `The note needs at least ${NOTE_MIN} characters.`
    : trimmed.length > NOTE_MAX ? `Keep the note to ${NOTE_MAX} characters or fewer.` : null;

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/rider/admin/${riderId}/restriction/clear/`, { note: trimmed });
      onDone('Online-payment-only cleared. Cash is available to this rider again.', 'done');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open title={`Clear online-payment-only · ${riderName}`} onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()}
            disabled={busy || (touched && problem !== null)}>{busy ? 'Working…' : 'Clear restriction'}</button>
        </>
      )}>
      <div className="ops-form">
        <div className="ops-confirm">
          <b>{riderName}</b>
          <span>The rider can choose cash again, starting now. The note is kept in the audit log.</span>
        </div>
        <label className="ops-form__label" htmlFor="rr-note">Note for the record (required)</label>
        <textarea id="rr-note" className="input" rows={3} value={note} maxLength={NOTE_MAX + 100}
          onChange={(e) => setNote(e.target.value)} aria-describedby="rr-note-count" />
        <span id="rr-note-count" className="help">{NOTE_MIN} to {NOTE_MAX} characters · {trimmed.length}</span>
        {touched && problem ? <div className="alert-error" role="alert">{problem}</div> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
