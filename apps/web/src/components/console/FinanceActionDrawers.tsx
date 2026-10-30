'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  ADJUST_REASONS, CREDIT_REASONS, NO_POLICY_WORDS, adjustBody, adjustProblem, creditBody,
  creditProblem, type Direction,
} from '@/lib/financeActions';
import { type ApprovalBody, formatMinor, interpretWrite, newIdempotencyKey } from '@/lib/trips';
import { Drawer } from '@/components/console/ui';

type Outcome = { kind: 'pending' | 'done'; message: string; requestId: number | null };

function failure(err: unknown): string {
  if (err instanceof ApiError && err.fromServer) {
    // The server's own words; the no-policy block gets the plain console sentence.
    return /threshold|policy/i.test(err.message) ? `${NO_POLICY_WORDS} ${err.message}` : err.message;
  }
  return 'That did not go through. Nothing was changed.';
}

/**
 * Adjust a driver's balance (finance.adjust). ALWAYS a maker-checker request:
 * within the policy's limit it runs at once, above it a second admin decides,
 * and in a country with no policy it is blocked. The drawer shows the pending
 * request after the submit, never "done" for something that is waiting.
 */
export function AdjustBalanceDrawer({
  driverId, driverName, currency, balanceMinor, onClose, onDone,
}: {
  driverId: number; driverName: string; currency: string; balanceMinor: number | null;
  onClose: () => void; onDone: (message: string, kind: 'pending' | 'done') => void;
}) {
  const [direction, setDirection] = useState<Direction>('credit');
  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState('correction');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [key] = useState(newIdempotencyKey);

  const input = { direction, amount, currency, balanceMinor, reasonCode, note };
  const problem = adjustProblem(input);

  async function submit() {
    if (problem) return;
    setBusy(true); setError(null);
    try {
      const body = await api.post<ApprovalBody>(
        `/payments/admin/drivers/${driverId}/adjust/`, adjustBody(input, key));
      const done = `${direction === 'credit' ? 'Credited' : 'Debited'} ${formatMinor(adjustBody(input, key).amount_minor, currency)} `
        + `${direction === 'credit' ? 'to' : 'from'} ${driverName}'s balance.`;
      const result = interpretWrite(body, done);
      setOutcome({ ...result, requestId: result.kind === 'pending' ? result.requestId : (body?.approval_request?.id ?? null) });
      onDone(result.message, result.kind);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`Adjust balance · ${driverName}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
            onClick={() => void submit()} disabled={busy || problem !== null}>
            {busy ? 'Working…' : direction === 'credit' ? 'Request credit' : 'Request debit'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? (
          <div className={outcome.kind === 'pending' ? 'ops-confirm' : 'alert-success'} role="status">
            <b>{outcome.message}</b>
            {outcome.kind === 'pending' ? (
              <span>
                Nothing has moved yet. A second finance admin decides request #{outcome.requestId}; the
                balance changes only when they approve it.
              </span>
            ) : null}
          </div>
        ) : (
          <>
            <div className="ops-confirm">
              <b>Correct {driverName}&apos;s settlement balance</b>
              <span>
                This writes a ledger entry on the driver&apos;s wallet ({currency}). It does not touch any trip
                fare. A debit can never take the balance below zero. Above the country&apos;s limit, a second
                admin must approve it; in a country with no approval policy it is blocked.
              </span>
            </div>
            <div className="ops-filterset">
              <fieldset>
                <legend>Direction</legend>
                <label><input type="radio" name="adj-direction" value="credit"
                  checked={direction === 'credit'} onChange={() => setDirection('credit')} />Credit (add)</label>
                <label><input type="radio" name="adj-direction" value="debit"
                  checked={direction === 'debit'} onChange={() => setDirection('debit')} />Debit (take back)</label>
              </fieldset>
            </div>
            <label className="ops-form__label" htmlFor="adj-amount">Amount ({currency})</label>
            <input id="adj-amount" className="input" inputMode="decimal" autoComplete="off" value={amount}
              onChange={(e) => setAmount(e.target.value)} />
            {balanceMinor !== null ? (
              <p className="help m-0">Balance now: {formatMinor(balanceMinor, currency)}</p>
            ) : null}
            <label className="ops-form__label" htmlFor="adj-reason">Reason</label>
            <select id="adj-reason" className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {Object.entries(ADJUST_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="ops-form__label" htmlFor="adj-note">Note (required, kept in the audit log)</label>
            <textarea id="adj-note" className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            {amount || note ? (problem ? <p className="help m-0" role="note">{problem}</p> : null) : null}
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

/**
 * Credit a rider's wallet (finance.adjust): closed-loop credit, never a debit.
 * Always needs a checker. With a ticket linked, the ticket gets an internal
 * note now and a neutral line to the rider only once the credit is added.
 */
export function CreditWalletDrawer({
  riderId, riderName, currency: given, ticketId, onClose, onDone,
}: {
  riderId: number; riderName: string; currency?: string | null; ticketId?: number;
  onClose: () => void; onDone: (message: string, kind: 'pending' | 'done') => void;
}) {
  const [currency, setCurrency] = useState<string | null>(given ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState('service_recovery');
  const [note, setNote] = useState('');
  const [ticket, setTicket] = useState(ticketId ? String(ticketId) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [key] = useState(newIdempotencyKey);

  // From a support ticket the rider's wallet currency is not known yet: ask.
  useEffect(() => {
    if (currency) return;
    let live = true;
    api.get<{ wallet?: { balances?: Array<{ currency: string }> } }>(`/rider/admin/${riderId}/`)
      .then((d) => {
        if (!live) return;
        const found = d.wallet?.balances?.[0]?.currency ?? null;
        if (found) setCurrency(found); else setLoadError('This rider has no wallet to credit.');
      })
      .catch(() => { if (live) setLoadError('The rider\'s wallet could not be read.'); });
    return () => { live = false; };
  }, [currency, riderId]);

  const input = { amount, currency: currency ?? '', reasonCode, note, ticketId: ticket };
  const problem = currency ? creditProblem(input) : 'Waiting for the wallet currency.';

  async function submit() {
    if (problem || !currency) return;
    setBusy(true); setError(null);
    try {
      const sent = creditBody(input, key);
      const body = await api.post<ApprovalBody>(`/payments/admin/riders/${riderId}/wallet-credit/`, sent);
      const result = interpretWrite(body, `Credit of ${formatMinor(sent.amount_minor, currency)} added to ${riderName}'s wallet.`);
      setOutcome({ ...result, requestId: result.kind === 'pending' ? result.requestId : (body?.approval_request?.id ?? null) });
      onDone(result.message, result.kind);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`Credit wallet · ${riderName}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
            onClick={() => void submit()} disabled={busy || problem !== null}>
            {busy ? 'Working…' : 'Request credit'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? (
          <div className={outcome.kind === 'pending' ? 'ops-confirm' : 'alert-success'} role="status">
            <b>{outcome.message}</b>
            {outcome.kind === 'pending' ? (
              <span>
                The wallet has not changed. A second finance admin decides request #{outcome.requestId}.
                {ticket.trim() ? ' The ticket has an internal note; the rider is told only once the credit is added.' : ''}
              </span>
            ) : null}
          </div>
        ) : (
          <>
            <div className="ops-confirm">
              <b>Add closed-loop credit to {riderName}&apos;s wallet</b>
              <span>
                Wallet credit is spendable on rides only; it cannot be withdrawn. There is no way to debit a
                rider&apos;s wallet here. Every credit needs a second admin to approve it, and a country with
                no approval policy is blocked.
              </span>
            </div>
            {loadError ? <div className="alert-error" role="alert">{loadError}</div> : null}
            <label className="ops-form__label" htmlFor="crd-amount">Amount ({currency ?? '…'})</label>
            <input id="crd-amount" className="input" inputMode="decimal" autoComplete="off" value={amount}
              onChange={(e) => setAmount(e.target.value)} disabled={!currency} />
            <label className="ops-form__label" htmlFor="crd-reason">Reason</label>
            <select id="crd-reason" className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {Object.entries(CREDIT_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="ops-form__label" htmlFor="crd-note">
              {reasonCode === 'other' ? 'Note (required)' : 'Note (optional)'}
            </label>
            <textarea id="crd-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <label className="ops-form__label" htmlFor="crd-ticket">Support ticket (optional)</label>
            <input id="crd-ticket" className="input" inputMode="numeric" autoComplete="off" value={ticket}
              onChange={(e) => setTicket(e.target.value)} readOnly={Boolean(ticketId)} />
            <p className="help m-0">
              A linked ticket must be this rider&apos;s. It gets an internal note now, and a neutral line to the
              rider once the credit is added.
            </p>
            {amount && problem ? <p className="help m-0" role="note">{problem}</p> : null}
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
