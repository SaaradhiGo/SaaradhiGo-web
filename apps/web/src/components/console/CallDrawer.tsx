'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Drawer } from '@/components/console/ui';

/**
 * Call a trip's rider or driver from the console (owner ruling, 25 Nov), through the same masked call
 * bridge as the apps: neither side sees the other's number. The bridge rings your own phone (the one
 * on your account), or gives you a number to dial. Until the calling keys exist it is the test bridge:
 * nobody's phone rings. Every call is audited and shows in the trip's call log.
 */
type Call = { session_id: number; to: string; kind: 'number' | 'session'; number: string | null; test: boolean };

export function CallDrawer({ tripId, to, onClose, onDone }: {
  tripId: number; to: 'rider' | 'driver'; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  async function start() {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ call: Call }>(`/ride/admin/trips/${tripId}/call/`, { to, reason: reason.trim() });
      setCall(r.call);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The call could not be started.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open title={`Call the ${to}`} onClose={onClose}
      footer={call ? <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button> : <>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void start()}
          disabled={busy || reason.trim().length < 5}>{busy ? 'Connecting…' : 'Call'}</button>
      </>}>
      <div className="ops-form">
        {call ? (
          <div className="ops-confirm" role="status">
            <b>{call.kind === 'session' ? 'Your phone will ring; answer to be connected.' : `Dial ${call.number} from your phone to be connected.`}</b>
            <span>{call.test ? 'Test calling: no real phone rings until the calling provider is live.' : 'Neither side sees the other’s number.'}</span>
          </div>
        ) : (
          <>
            <p className="help m-0">A masked call: the {to} does not see your number and you do not see theirs. It is recorded in the trip’s call log.</p>
            <label className="ops-form__label" htmlFor="call-why">Why you are calling (kept in the audit log)</label>
            <textarea id="call-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </>
        )}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
