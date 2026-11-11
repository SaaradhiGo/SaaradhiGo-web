'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Drawer } from '@/components/console/ui';

export type SosAction = 'acknowledge' | 'resolve' | 'false-alarm';

const VERB: Record<SosAction, string> = {
  acknowledge: 'Acknowledge', resolve: 'Resolve', 'false-alarm': 'Mark as false alarm',
};

const HELP: Record<SosAction, string> = {
  acknowledge: 'Tells the team that somebody is on it. A note is optional.',
  resolve: 'Say what happened and how it ended. This is recorded permanently and read in any review.',
  'false-alarm': 'Say why this was not an emergency. This is recorded permanently.',
};

/**
 * Acknowledge, resolve or dismiss one SOS. The note is typed here, not in a
 * browser prompt, and resolving or dismissing without one is refused before
 * the server refuses it. The server stamps the case file's timeline.
 */
export function SosActionDrawer({
  sosId, action, onClose, onDone,
}: {
  sosId: number; action: SosAction; onClose: () => void; onDone: (message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (action !== 'acknowledge' && note.trim().length < 5) {
      setError('A note is required when resolving or dismissing an SOS. It is recorded permanently.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/sos/admin/${sosId}/${action}/`, { note: note.trim() });
      onDone(`SOS #${sosId}: ${VERB[action].toLowerCase()} done.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${VERB[action]} · SOS #${sosId}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Working…' : VERB[action]}
          </button>
        </>
      )}
    >
      <div className="ops-confirm">
        <b>{VERB[action]}</b>
        <span>{HELP[action]}</span>
        <label className="sr-only" htmlFor="sos-note">Note</label>
        <textarea
          id="sos-note" className="input" rows={4} value={note} autoFocus
          onChange={(e) => setNote(e.target.value)}
          placeholder={action === 'acknowledge' ? 'Optional note' : 'What happened'}
        />
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
