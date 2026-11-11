'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { OUTCOME_LABEL } from '@/lib/safety';
import { Drawer } from '@/components/console/ui';

/**
 * The four things a responder does to an SOS, each within two clicks of the
 * list row and the case page (owner, 2026-11-03):
 *
 *   Acknowledge      one click: every open SOS on the case, case to investigating
 *   Assign to me     one click
 *   Resolve          click, then pick the outcome and say what happened
 *   False alarm      click, then say why (required)
 *
 * They act on the CASE (`/safety/admin/incidents/<id>/...`), so a second press
 * on the same trip never needs answering separately. The server re-checks
 * scope and capability on every call; these buttons only appear for a caller
 * who may respond.
 */

export type SosCase = {
  id: number;
  ref: string;
  assigned_to: number | null;
  status: string;
  sos: { unacknowledged?: number | null; active?: number | null };
};

type Dialog = 'resolve' | 'false_alarm' | null;

const OUTCOMES = ['no_action', 'warning', 'driver_suspended', 'rider_blocked', 'police_referral', 'other'];

export function SosActions({
  item, meId, onDone, compact = false,
}: {
  item: SosCase;
  meId: number | string | null | undefined;
  onDone: (message: string) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState('no_action');
  const [problem, setProblem] = useState<string | null>(null);

  if (item.status === 'closed') return null;
  const base = `/safety/admin/incidents/${item.id}`;
  const size = compact ? ' sg-btn--sm' : '';
  const unacked = (item.sos.unacknowledged ?? 0) > 0;
  const mine = meId !== null && meId !== undefined && String(item.assigned_to) === String(meId);

  async function post(path: string, body: Record<string, string>, done: string) {
    setBusy(true);
    setProblem(null);
    try {
      await api.post(`${base}/${path}/`, body);
      setDialog(null);
      setText('');
      onDone(done);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (!text.trim()) {
      setProblem(dialog === 'false_alarm' ? 'Say why this is a false alarm.' : 'Say what happened.');
      return;
    }
    if (dialog === 'false_alarm') {
      void post('false-alarm', { reason: text.trim() }, `${item.ref} closed as a false alarm.`);
    } else {
      void post('resolve', { summary: text.trim(), outcome }, `${item.ref} resolved.`);
    }
  }

  return (
    <span className="ops-sos-actions">
      {unacked ? (
        <button type="button" className={`sg-btn sg-btn--primary${size}`} disabled={busy}
          onClick={() => void post('acknowledge', {}, `${item.ref} acknowledged.`)}>
          Acknowledge
        </button>
      ) : null}
      {!mine ? (
        <button type="button" className={`sg-btn sg-btn--secondary${size}`} disabled={busy}
          onClick={() => void post('assign', { assigned_to: 'me' }, `${item.ref} is assigned to you.`)}>
          Assign to me
        </button>
      ) : null}
      <button type="button" className={`sg-btn sg-btn--ghost${size}`} disabled={busy}
        onClick={() => { setProblem(null); setText(''); setDialog('resolve'); }}>
        Resolve…
      </button>
      <button type="button" className={`sg-btn sg-btn--ghost${size}`} disabled={busy}
        onClick={() => { setProblem(null); setText(''); setDialog('false_alarm'); }}>
        False alarm…
      </button>
      {problem && !dialog ? <span className="alert-error" role="alert">{problem}</span> : null}
      <Drawer
        open={dialog !== null}
        title={dialog === 'false_alarm' ? `Mark ${item.ref} as a false alarm` : `Resolve ${item.ref}`}
        onClose={() => setDialog(null)}
        footer={(
          <div>
            <button type="button" className="sg-btn sg-btn--primary" disabled={busy} onClick={confirm}>
              {dialog === 'false_alarm' ? 'Mark false alarm' : 'Resolve'}
            </button>{' '}
            <button type="button" className="sg-btn sg-btn--ghost" disabled={busy} onClick={() => setDialog(null)}>
              Back
            </button>
          </div>
        )}
      >
        <div className="ops-confirm">
          {dialog === 'resolve' ? (
            <>
              <label htmlFor={`outcome-${item.id}`}><b>Outcome</b></label>
              <select id={`outcome-${item.id}`} className="input" value={outcome}
                onChange={(e) => setOutcome(e.target.value)}>
                {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o] ?? o}</option>)}
              </select>
            </>
          ) : (
            <span>Every active SOS on this case is closed as a false alarm, and the case closes with no action needed.</span>
          )}
          <label htmlFor={`text-${item.id}`}>
            <b>{dialog === 'false_alarm' ? 'Why is it a false alarm?' : 'What happened?'}</b> (required, kept in the case file)
          </label>
          <textarea id={`text-${item.id}`} className="input" rows={3} value={text}
            onChange={(e) => setText(e.target.value)} maxLength={5000} />
          {problem ? <div className="alert-error" role="alert">{problem}</div> : null}
        </div>
      </Drawer>
    </span>
  );
}
