'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { interpretWrite } from '@/lib/trips';
import { Drawer } from '@/components/console/ui';
import { ChangePreview } from '@/components/console/edit/ChangePreview';

/**
 * Hold a driver's payouts (owner ruling, 25 Nov): one of four reasons, a written reason, at most
 * 14 days, a second person approves, and the driver is told. Earnings stay in the wallet; the hold
 * lapses on its own.
 */
export const HOLD_REASONS: Array<[string, string]> = [
  ['suspected_fraud', 'Suspected fraud'], ['dispute', 'Dispute'], ['compliance_check', 'Compliance check'],
  ['payout_details_verification', 'Payout details being verified'],
];

export function PayoutHoldDrawer({ driverId, driverName, onClose, onDone }: {
  driverId: number; driverName: string; onClose: () => void; onDone: (text: string) => void;
}) {
  const [kind, setKind] = useState('dispute');
  const [days, setDays] = useState('7');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => `hold-${driverId}-${Date.now()}`);
  const n = Number(days);
  const okDays = Number.isInteger(n) && n >= 1 && n <= 14;
  const ready = !busy && okDays && note.trim().length >= 10;
  const label = HOLD_REASONS.find(([k]) => k === kind)?.[1] ?? kind;

  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/payments/admin/drivers/${driverId}/payout-hold/`,
        { reason_kind: kind, days: n, note: note.trim(), idempotency_key: key });
      onDone(interpretWrite(r as never, 'Sent for approval.').message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }

  return (
    <Drawer open title={`Hold payouts · ${driverName}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()} disabled={!ready}>
          {busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="ops-form">
        <p className="help m-0">Earnings stay in the driver’s wallet and are paid when the hold ends. A second person approves it, and the driver is told.</p>
        <label className="ops-form__label" htmlFor="hold-kind">Reason</label>
        <select id="hold-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {HOLD_REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="ops-form__label" htmlFor="hold-days">For how many days (1 to 14)</label>
        <input id="hold-days" className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
        {!okDays ? <p className="help m-0" role="note">A hold lasts 1 to 14 days.</p> : null}
        <label className="ops-form__label" htmlFor="hold-note">Why, in writing (the approver and the history see it)</label>
        <textarea id="hold-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        {okDays ? <ChangePreview display={{ changes: [{ label: 'Payouts', from: 'Paid as usual', to: `Held for ${n} ${n === 1 ? 'day' : 'days'} (${label})` }],
          effective: 'From approval; it ends on its own. The driver is told.' }} /> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
