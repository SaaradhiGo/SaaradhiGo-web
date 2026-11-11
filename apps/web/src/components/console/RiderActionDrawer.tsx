'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { BULK_CHECKER_ABOVE, type ApprovalBody, interpretWrite, newIdempotencyKey, words } from '@/lib/trips';
import { FALLBACK_BLOCK_REASONS, FALLBACK_FLAG_REASONS, type RiderActionKey } from '@/lib/riders';
import { Drawer, Fact, Facts } from '@/components/console/ui';

const TITLE: Record<RiderActionKey, string> = {
  block: 'Block rider', unblock: 'Unblock rider', flag: 'Flag rider', unflag: 'Clear flags',
  sign_out: 'Sign out everywhere', note: 'Internal note',
};

const CONSEQUENCE: Record<RiderActionKey, string> = {
  block: 'They cannot request a ride or restart a search until unblocked. They stay signed in, can see their trips, pay what they owe, contact support and raise an SOS. A trip already under way is not affected.',
  unblock: 'They can request rides again straight away.',
  flag: 'Marks the rider for Fraud & Risk review. Nothing changes for the rider.',
  unflag: 'Clears every open flag on this rider.',
  sign_out: 'Ends every session on every device: the app asks them to sign in again within 15 minutes. It does not block them.',
  note: 'Seen by operators only. The rider never sees it.',
};

type Outcome = { kind: 'pending' | 'done'; message: string };

function failure(err: unknown): string {
  return err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.';
}

/**
 * One dialog for the rider writes. Each reads the consequence back before
 * the button, asks for the reason the server requires, and shows the
 * server's answer. Nothing here moves money.
 */
export function RiderActionDrawer({
  action, riderId, riderName, blockReasons, flagReasons, onClose, onDone,
}: {
  action: RiderActionKey; riderId: number; riderName: string;
  blockReasons?: Record<string, string>; flagReasons?: Record<string, string>;
  onClose: () => void; onDone: (message: string, kind: 'pending' | 'done') => void;
}) {
  const reasons = action === 'flag' ? (flagReasons ?? FALLBACK_FLAG_REASONS) : (blockReasons ?? FALLBACK_BLOCK_REASONS);
  const [code, setCode] = useState(Object.keys(reasons)[0] ?? 'other');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [key] = useState(newIdempotencyKey);

  const needsText = action === 'note' || action === 'unblock' || action === 'sign_out'
    || (action === 'block' && code === 'other');
  const ready = !busy && (!needsText || text.trim() !== '');

  async function submit() {
    setBusy(true); setError(null);
    const base = `/rider/admin/${riderId}`;
    try {
      let done = '';
      if (action === 'block') {
        await api.post(`${base}/block/`, { reason_code: code, note: text });
        done = `${riderName} is blocked from requesting rides.`;
      } else if (action === 'unblock') {
        const r = await api.post<{ changed?: boolean }>(`${base}/unblock/`, { note: text });
        done = r?.changed === false ? `${riderName} was not blocked.` : `${riderName} can request rides again.`;
      } else if (action === 'flag') {
        await api.post(`${base}/flag/`, { reason: code, note: text });
        done = `${riderName} is flagged for review.`;
      } else if (action === 'unflag') {
        const r = await api.post<{ cleared?: number }>(`${base}/unflag/`, { note: text });
        done = `${r?.cleared ?? 0} flag${r?.cleared === 1 ? '' : 's'} cleared.`;
      } else if (action === 'sign_out') {
        const r = await api.post<{ revoked?: number }>(`${base}/sign-out/`, { reason: text });
        done = r?.revoked ? `${r.revoked} session${r.revoked === 1 ? '' : 's'} ended.` : 'There were no sessions to end.';
      } else {
        await api.post(`${base}/note/`, { body: text, idempotency_key: key });
        done = 'Note added.';
      }
      const result = interpretWrite(null, done);
      setOutcome(result);
      onDone(result.message, result.kind);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  const label = action === 'note' ? 'Note (operators only)'
    : needsText ? 'Reason (required)' : 'Note (optional)';

  return (
    <Drawer
      open
      title={`${TITLE[action]} · ${riderName}`}
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
          <div className="alert-success" role="status"><b>{outcome.message}</b></div>
        ) : (
          <>
            <div className="ops-confirm">
              <b>{TITLE[action]}: {riderName}</b>
              <span>{CONSEQUENCE[action]}</span>
            </div>
            {action === 'block' || action === 'flag' ? (
              <div className="ops-filterset">
                <fieldset>
                  <legend>Reason</legend>
                  {Object.entries(reasons).map(([v, l]) => (
                    <label key={v}><input type="radio" name="rider-reason" value={v} checked={code === v} onChange={() => setCode(v)} />{l}</label>
                  ))}
                </fieldset>
              </div>
            ) : null}
            <label className="ops-form__label" htmlFor="rdr-act-text">{label}</label>
            <textarea id="rdr-act-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

export type BulkRiderAction = 'block' | 'unblock';
type BulkResult = { results: Array<{ id: number; result: string }>; counts: Record<string, number> };

/**
 * Bulk block / unblock on the ticked rows. Over 50 the server sends it to a
 * second admin (202): the dialog says so before anything is pressed, and
 * after, reads "Sent for approval · request #N" -- nothing has changed yet.
 */
export function RiderBulkDrawer({ action, ids: picked, onClose, onDone }: {
  action: BulkRiderAction; ids: number[]; onClose: () => void; onDone: () => void;
}) {
  // Held from the moment the dialog opens: the list clears its ticks when
  // this reports back, and the answer must still name what was sent.
  const [ids] = useState(picked);
  const [reason, setReason] = useState('fraud');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rows, setRows] = useState<BulkResult | null>(null);
  const [key] = useState(newIdempotencyKey);
  const needsNote = action === 'unblock' || reason === 'other';
  const verb = action === 'block' ? 'Block' : 'Unblock';
  const checker = ids.length > BULK_CHECKER_ABOVE;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = await api.post<ApprovalBody & { result?: BulkResult }>('/rider/admin/bulk/', {
        action, rider_ids: ids, note, idempotency_key: key,
        ...(action === 'block' ? { reason_code: reason } : {}),
      });
      const result = interpretWrite(body, `${verb}ed — see each rider below.`);
      setOutcome(result);
      if (result.kind === 'done' && body?.result) setRows(body.result as BulkResult);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The bulk action did not go through.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${verb} ${ids.length} rider${ids.length === 1 ? '' : 's'}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || (needsNote && !note.trim())}>
            {busy ? 'Working…' : checker ? 'Send for approval' : `${verb} riders`}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? (
          <div className={outcome.kind === 'pending' ? 'ops-confirm' : 'alert-success'} role="status">
            <b>{outcome.message}</b>
            {outcome.kind === 'pending' ? <span>Nothing has changed yet. A second admin must approve; the request is listed on each rider until then.</span> : null}
          </div>
        ) : (
          <>
            {checker ? (
              <div className="ops-confirm"><b>Needs a checker</b><span>More than {BULK_CHECKER_ABOVE} riders: nothing changes until a second admin approves.</span></div>
            ) : null}
            {action === 'block' ? (
              <div className="ops-filterset">
                <fieldset>
                  <legend>Reason</legend>
                  {Object.entries(FALLBACK_BLOCK_REASONS).map(([v, l]) => (
                    <label key={v}><input type="radio" name="bulk-reason" value={v} checked={reason === v} onChange={() => setReason(v)} />{l}</label>
                  ))}
                </fieldset>
              </div>
            ) : null}
            <label className="ops-form__label" htmlFor="bulk-note">Note{needsNote ? ' (required)' : ''}</label>
            <textarea id="bulk-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <p className="help">{action === 'block'
              ? 'Blocked riders cannot request rides. Riders already blocked are skipped and listed.'
              : 'Unblocked riders can request rides again straight away.'}</p>
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
        {rows ? (
          <Facts>
            {rows.results.map((r) => <Fact key={r.id} label={`#${r.id}`}>{words(r.result)}</Fact>)}
          </Facts>
        ) : null}
      </div>
    </Drawer>
  );
}
