'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  type ActionKey, type ApprovalBody, formatMinor, interpretWrite, newIdempotencyKey, parseMajorToMinor,
} from '@/lib/trips';
import { Drawer } from '@/components/console/ui';

const FALLBACK_CANCEL: Record<string, string> = {
  rider_request: 'Rider asked support to cancel', driver_request: 'Driver asked support to cancel',
  no_driver: 'No driver is coming', stale: 'Trip is stale (no progress)', safety: 'Safety concern',
  fraud_suspicion: 'Suspected fraud', duplicate: 'Duplicate booking', other: 'Other (note required)',
};
const FALLBACK_FLAG: Record<string, string> = {
  fraud_suspicion: 'Fraud suspicion', safety: 'Safety', dispute: 'Dispute',
};
const TITLE: Record<ActionKey, string> = {
  cancel: 'Cancel trip', refund: 'Refund', adjust: 'Adjust fare', flag: 'Flag trip', note: 'Internal note',
};

/**
 * One dialog for the five trip writes. Each asks for a reason, reads the
 * consequence back before the button, and shows the server's answer --
 * including "Sent for approval · request #N" when a checker is needed.
 */
export function ActionDrawer({
  action, tripId, currency, refundable, refundKey, riderName, cancelReasons, flagReasons, onClose, onDone,
  ticketId,
}: {
  action: ActionKey; tripId: number; currency: string; refundable: number | null;
  refundKey: string | null; riderName: string;
  /** The support ticket a refund is for (fare review): sent with the refund so the server links them. */
  ticketId?: number;
  cancelReasons?: Record<string, string>; flagReasons?: Record<string, string>;
  onClose: () => void; onDone: (message: string, kind: 'pending' | 'done') => void;
}) {
  const reasons = action === 'cancel' ? (cancelReasons ?? FALLBACK_CANCEL)
    : action === 'flag' ? (flagReasons ?? FALLBACK_FLAG) : null;
  const [code, setCode] = useState(reasons ? Object.keys(reasons)[0] : '');
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [waive, setWaive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: 'pending' | 'done'; message: string } | null>(null);
  const [key] = useState(newIdempotencyKey);

  const money = action === 'refund' || action === 'adjust';
  const parsed = money ? parseMajorToMinor(amount, currency, { allowNegative: action === 'adjust' }) : null;
  const overRefundable = action === 'refund' && parsed !== null && refundable !== null && parsed > refundable;
  const needsText = action === 'note' || money || (action === 'cancel' && code === 'other');
  const ready = !busy && (!money || (parsed !== null && !overRefundable)) && (!needsText || text.trim() !== '');

  async function submit() {
    setBusy(true); setError(null);
    const base = `/ride/admin/trips/${tripId}`;
    try {
      let body: ApprovalBody | null = null;
      let done = '';
      if (action === 'cancel') {
        await api.post(`${base}/cancel/`, { reason_code: code, note: text, waive_fee: waive });
        done = 'Trip cancelled. The rider and driver have been told.';
      } else if (action === 'refund') {
        body = await api.post<ApprovalBody>(`${base}/refund/`, {
          amount_minor: parsed, reason: text, idempotency_key: key,
          ...(ticketId ? { ticket_id: ticketId } : {}),
        });
        done = `Refund of ${formatMinor(parsed, currency)} recorded.`;
      } else if (action === 'adjust') {
        body = await api.post<ApprovalBody>(`${base}/adjust-fare/`, { amount_minor: parsed, reason: text, idempotency_key: key });
        done = `Adjustment of ${formatMinor(parsed, currency, { signed: true })} recorded.`;
      } else if (action === 'flag') {
        await api.post(`${base}/flag/`, { reason: code, note: text });
        done = 'Trip flagged.';
      } else {
        await api.post(`${base}/note/`, { body: text, idempotency_key: key });
        done = 'Note added.';
      }
      const result = interpretWrite(body, done);
      setOutcome(result);
      onDone(result.message, result.kind);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${TITLE[action]} · trip #${tripId}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Working…' : TITLE[action]}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? (
          <div className={outcome.kind === 'pending' ? 'ops-confirm' : 'alert-success'} role="status">
            <b>{outcome.message}</b>
            {outcome.kind === 'pending' ? <span>A second admin must approve before anything moves. It is listed on this trip until then.</span> : null}
          </div>
        ) : (
          <>
            {reasons ? (
              <div className="ops-filterset">
                <fieldset>
                  <legend>Reason</legend>
                  {Object.entries(reasons).map(([v, l]) => (
                    <label key={v}><input type="radio" name={`${action}-reason`} value={v} checked={code === v} onChange={() => setCode(v)} />{l}</label>
                  ))}
                </fieldset>
              </div>
            ) : null}
            {money ? (
              <>
                <label className="ops-form__label" htmlFor="act-amount">Amount ({currency}){action === 'adjust' ? ', minus for a reduction' : ''}</label>
                <input id="act-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />
                {action === 'refund' && refundable !== null ? <p className="help">Up to {formatMinor(refundable, currency)} is left to refund to {riderName}.</p> : null}
                {amount && parsed === null ? <p className="alert-error" role="alert">Enter an amount in {currency}, at most {currency === 'JPY' ? 'whole units' : 'two decimals'}.</p> : null}
                {overRefundable ? <p className="alert-error" role="alert">That is more than is left to refund.</p> : null}
              </>
            ) : null}
            {action === 'cancel' ? (
              <label className="ops-form__row"><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive any cancellation fee</label>
            ) : null}
            <label className="ops-form__label" htmlFor="act-text">{action === 'note' ? 'Note (operators only)' : needsText ? 'Reason (required)' : 'Note (optional)'}</label>
            <textarea id="act-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            {parsed !== null && !overRefundable ? (
              <div className="ops-confirm">
                <b>{action === 'refund' ? `Refund ${formatMinor(parsed, currency)} to ${riderName}` : `Adjust the fare by ${formatMinor(parsed, currency, { signed: true })}`}</b>
                <span>{action === 'refund'
                  ? `${refundKey === 'finance.refund' ? 'Finance' : 'Support'} limit applies; above it this goes to a checker. Cash and wallet trips are credited to the rider's wallet; online payments are recorded for finance to send.`
                  : 'Recorded in the trip ledger. Above the adjustment limit this goes to a checker.'}</span>
              </div>
            ) : null}
            {action === 'cancel' ? <p className="help">Only trips that have not started can be cancelled here. No fee is charged.</p> : null}
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
