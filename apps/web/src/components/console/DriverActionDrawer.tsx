'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { type ApprovalBody, interpretWrite, newIdempotencyKey } from '@/lib/trips';
import { type DriverActionKey, FALLBACK_SUSPEND_REASONS } from '@/lib/drivers';
import { Drawer } from '@/components/console/ui';

const TITLE: Record<DriverActionKey, string> = {
  approve: 'Approve to drive', suspend: 'Suspend driver', reinstate: 'Reinstate driver',
  note: 'Internal note', deactivate: 'Deactivate permanently',
};

const CONSEQUENCE: Record<DriverActionKey, string> = {
  approve: 'They can go online and receive ride offers as soon as this is saved.',
  suspend: 'They are taken off the road now: they cannot go online, receive offers or accept a ride until reinstated. Nothing about their earnings changes.',
  reinstate: 'Approval comes back only if they still pass the KYC checks today; otherwise they return to the KYC queue.',
  note: 'Seen by operators only. The driver never sees it.',
  deactivate: 'Locks the account for good. Nothing is deleted. A second admin must approve before anything changes.',
};

type Blocker = { code: string; message: string };

/**
 * One dialog for the driver writes. Each reads the consequence back before
 * the button, asks for the reason the server requires, and shows the
 * server's answer -- including "Sent for approval · request #N" on a 202.
 */
export function DriverActionDrawer({
  action, driverId, driverName, blockers = [], suspendReasons, onClose, onDone,
}: {
  action: DriverActionKey; driverId: number; driverName: string;
  blockers?: Blocker[]; suspendReasons?: Record<string, string>;
  onClose: () => void; onDone: (message: string, kind: 'pending' | 'done') => void;
}) {
  const reasons = suspendReasons ?? FALLBACK_SUSPEND_REASONS;
  const [code, setCode] = useState(Object.keys(reasons)[0] ?? 'other');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: 'pending' | 'done'; message: string } | null>(null);
  const [key] = useState(newIdempotencyKey);

  const needsText = action === 'note' || action === 'reinstate' || (action === 'suspend' && code === 'other');
  const blocked = action === 'approve' && blockers.length > 0;
  const ready = !busy && !blocked && (!needsText || text.trim() !== '');

  async function submit() {
    setBusy(true); setError(null);
    const base = `/driver/admin/${driverId}`;
    try {
      let body: ApprovalBody | null = null;
      let done = '';
      if (action === 'approve') {
        await api.post(`${base}/approve/`, { note: text });
        done = `${driverName} is approved and can go online.`;
      } else if (action === 'suspend') {
        await api.post(`${base}/suspend/`, { reason_code: code, note: text });
        done = `${driverName} is suspended and off the road.`;
      } else if (action === 'reinstate') {
        const r = await api.post<{ approved?: boolean; back_to_review?: boolean }>(`${base}/reinstate/`, { note: text });
        done = r?.approved ? `${driverName} is reinstated and approved again.`
          : r?.back_to_review ? `${driverName} is reinstated and back in the KYC queue: a check no longer passes.`
            : `${driverName} is reinstated.`;
      } else if (action === 'note') {
        await api.post(`${base}/note/`, { body: text, idempotency_key: key });
        done = 'Note added.';
      } else {
        body = await api.delete<ApprovalBody>(`${base}/delete/`);
        done = `${driverName} is deactivated.`;
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
      title={`${TITLE[action]} · ${driverName}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Working…' : action === 'deactivate' ? 'Send for approval' : TITLE[action]}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? (
          <div className={outcome.kind === 'pending' ? 'ops-confirm' : 'alert-success'} role="status">
            <b>{outcome.message}</b>
            {outcome.kind === 'pending' ? <span>A second admin must approve before anything changes. It is listed on this driver until then.</span> : null}
          </div>
        ) : (
          <>
            <div className="ops-confirm">
              <b>{TITLE[action]}: {driverName}</b>
              <span>{CONSEQUENCE[action]}</span>
            </div>
            {blocked ? (
              <div className="alert-error" role="alert">
                <b>The server will refuse this approval:</b>
                <ul>{blockers.map((b) => <li key={`${b.code}-${b.message}`}>{b.message}</li>)}</ul>
              </div>
            ) : null}
            {action === 'suspend' ? (
              <div className="ops-filterset">
                <fieldset>
                  <legend>Reason</legend>
                  {Object.entries(reasons).map(([v, l]) => (
                    <label key={v}><input type="radio" name="suspend-reason" value={v} checked={code === v} onChange={() => setCode(v)} />{l}</label>
                  ))}
                </fieldset>
              </div>
            ) : null}
            {action !== 'deactivate' ? (
              <>
                <label className="ops-form__label" htmlFor="drv-act-text">
                  {action === 'note' ? 'Note (operators only)' : needsText ? 'Reason (required)' : 'Note (optional)'}
                </label>
                <textarea id="drv-act-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
              </>
            ) : null}
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

export type ReviewTarget = {
  key: string; label: string; owner: 'driver' | 'vehicle'; vehicle_id: number | null;
};

/**
 * Approve or reject ONE document. A rejection needs a reason, and the
 * dialog says plainly that the driver will read it.
 */
export function DocumentReviewDrawer({
  driverId, doc, decision, onClose, onDone,
}: {
  driverId: number; doc: ReviewTarget; decision: 'approve' | 'reject';
  onClose: () => void; onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const reject = decision === 'reject';
  const ready = !busy && (!reject || reason.trim().length >= 5);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post(`/driver/admin/${driverId}/documents/review/`, {
        document_key: doc.key, vehicle_id: doc.vehicle_id, decision, reason: reject ? reason.trim() : '',
      });
      const message = reject ? `${doc.label} rejected. The driver can read your reason in the app.` : `${doc.label} approved.`;
      setDone(message);
      onDone(message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  const title = `${reject ? 'Reject' : 'Approve'} ${doc.label}`;
  return (
    <Drawer
      open
      title={title}
      onClose={onClose}
      footer={done ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={!ready}>
            {busy ? 'Working…' : reject ? 'Reject document' : 'Approve document'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {done ? (
          <div className="alert-success" role="status"><b>{done}</b></div>
        ) : reject ? (
          <>
            <label className="ops-form__label" htmlFor="doc-reason">What does the driver need to change? (required)</label>
            <textarea
              id="doc-reason" className="input" rows={4} value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The photo is cut off at the bottom. Please upload the whole document."
            />
            <p className="help">The driver sees this in the app, word for word. Write it for them.</p>
          </>
        ) : (
          <div className="ops-confirm">
            <b>{title}</b>
            <span>Approving one document does not approve the driver: that is a separate step once every document is in order.</span>
          </div>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
