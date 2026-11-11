'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { can, useAdminAccess } from '@/lib/adminScope';
import {
  FALLBACK_CONFIRM_REASONS, FALLBACK_DISMISS_REASONS, FALLBACK_REOPEN_REASONS, NOTE_MAX, NOTE_MIN,
  decisionProblem, noteCount, type FlagDetail, type Handoff, type Options,
} from '@/lib/fraud';
import { Drawer } from '@/components/console/ui';
import { HandoffButtons } from '@/components/console/fraud/HandoffButtons';

export type FlagAction = 'confirm' | 'dismiss' | 'reopen' | 'note' | 'assign';

export const ACTION_TITLE: Record<FlagAction, string> = {
  confirm: 'Confirm fraud', dismiss: 'Dismiss flag', reopen: 'Reopen flag', note: 'Add a note',
  assign: 'Assign reviewer',
};

const CONSEQUENCE: Record<FlagAction, string> = {
  confirm: 'Confirming records that you reviewed this and found it to be fraud. It does not suspend anyone, '
    + 'take any money, hold a payout, or tell the person. A reward already held for this flag stays held for '
    + 'Finance only if the reason is promotion abuse, collusion or multiple accounts; otherwise it is released. '
    + 'Anything further is a separate action, with its own permission and, where it applies, a second approver.',
  dismiss: 'Dismissing records that this is not fraud. The person is not told, and any reward held for this '
    + 'flag is released at once. If a rider carries a promo-abuse '
    + 'flag from this, it is cleared with your note. The flag can be reopened later.',
  reopen: 'Puts the flag back in the queue for review. The earlier decision stays on the timeline.',
  note: 'Seen by reviewers only. The person never sees it.',
  assign: 'The flag moves to In review under the person you choose.',
};

type Reviewer = { id: number; label: string; me: boolean };

function failure(err: unknown): string {
  return err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.';
}

/**
 * One dialog for the review writes. Each reads the consequence back before the button, asks for the
 * reason code and note the server requires, and shows the server's answer. The reason list depends
 * on the decision; the form refuses a missing reason or a note outside 5 to 500 characters before
 * anything is sent. Nothing here moves money.
 */
export function FlagDecisionDrawer({
  action, flag, options, onClose, onDone,
}: {
  action: FlagAction; flag: FlagDetail; options: Options | null;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const access = useAdminAccess();
  const reasons = action === 'confirm' ? (options?.confirm_reasons ?? FALLBACK_CONFIRM_REASONS)
    : action === 'dismiss' ? (options?.dismiss_reasons ?? FALLBACK_DISMISS_REASONS)
      : action === 'reopen' ? (options?.reopen_reasons ?? FALLBACK_REOPEN_REASONS) : [];
  const needsReason = reasons.length > 0;
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reviewers, setReviewers] = useState<Reviewer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ message: string; handoffs: Handoff[] } | null>(null);

  useEffect(() => {
    if (action !== 'assign') return;
    api.get<{ results: Reviewer[] }>(`/fraud/admin/flags/${flag.id}/reviewers/`)
      .then((r) => { setReviewers(r.results); setAssignee(String(r.results.find((x) => x.me)?.id ?? r.results[0]?.id ?? '')); })
      .catch((err) => { setReviewers([]); setError(failure(err)); });
  }, [action, flag.id]);

  // What the person who confirms can go on to do: only the actions they hold the capability for.
  const nextSteps = useMemo(
    () => flag.handoffs.filter((h) => can(access, h.capability)),
    [flag.handoffs, access],
  );

  const problem = action === 'note'
    ? decisionProblem({ reason: 'note', note }, [{ key: 'note' }])
    : action === 'assign' ? (assignee ? null : 'Choose a reviewer.')
      : decisionProblem({ reason, note }, reasons);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError(null);
    const base = `/fraud/admin/flags/${flag.id}`;
    try {
      let message = '';
      if (action === 'confirm') {
        await api.post(`${base}/confirm/`, { reason_code: reason, note });
        message = 'Confirmed. The decision is on the timeline.';
      } else if (action === 'dismiss') {
        await api.post(`${base}/dismiss/`, { reason_code: reason, note });
        message = 'Dismissed. The decision is on the timeline.';
      } else if (action === 'reopen') {
        await api.post(`${base}/reopen/`, { reason_code: reason, note });
        message = 'Reopened. The flag is back in the queue.';
      } else if (action === 'note') {
        await api.post(`${base}/note/`, { note });
        message = 'Note added.';
      } else {
        await api.post(`${base}/assign/`, { assignee_id: Number(assignee) });
        message = 'Assigned.';
      }
      onDone(message);
      if (action === 'confirm') setDone({ message, handoffs: nextSteps.map((h) => ({ ...h, available: true })) });
      else onClose();
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  const label = action === 'note' ? 'Note (reviewers only)' : 'Note for the record (required)';
  const title = `${ACTION_TITLE[action]} · flag #${flag.id}`;

  return (
    <Drawer
      open wide
      title={title}
      onClose={onClose}
      footer={done ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()}
            disabled={busy || (touched && problem !== null)}>
            {busy ? 'Working…' : ACTION_TITLE[action]}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {done ? (
          <>
            <div className="alert-success" role="status"><b>{done.message}</b></div>
            {done.handoffs.length > 0 ? (
              <div className="fr-next">
                <b>Take it further, if it is warranted</b>
                <span className="muted">Each opens the page where that action already lives. It asks for its own reason and, where the rules say so, a second approver. Choosing one is recorded here.</span>
                <HandoffButtons flagId={flag.id} handoffs={done.handoffs} />
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="ops-confirm">
              <b>{ACTION_TITLE[action]}: {flag.subject.ref}</b>
              <span>{CONSEQUENCE[action]}</span>
            </div>
            {needsReason ? (
              <div className="ops-filterset">
                <fieldset aria-describedby={touched && problem ? 'fr-problem' : undefined}>
                  <legend>Reason</legend>
                  {reasons.map((r) => (
                    <label key={r.key}>
                      <input type="radio" name="fraud-reason" value={r.key} checked={reason === r.key}
                        onChange={() => setReason(r.key)} />
                      {r.label}
                    </label>
                  ))}
                </fieldset>
              </div>
            ) : null}
            {action === 'assign' ? (
              <>
                <label className="ops-form__label" htmlFor="fr-assignee">Reviewer</label>
                <select id="fr-assignee" className="ops-select" value={assignee} onChange={(e) => setAssignee(e.target.value)}
                  disabled={reviewers === null}>
                  {(reviewers ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}{r.me ? ' (you)' : ''}</option>)}
                </select>
              </>
            ) : (
              <>
                <label className="ops-form__label" htmlFor="fr-note">{label}</label>
                <textarea id="fr-note" className="input" rows={4} value={note} maxLength={NOTE_MAX + 100}
                  aria-describedby="fr-note-count" onChange={(e) => setNote(e.target.value)} />
                <span id="fr-note-count" className="help">{NOTE_MIN} to {NOTE_MAX} characters · {noteCount(note)}</span>
              </>
            )}
            {action === 'confirm' && nextSteps.length > 0 ? (
              <div className="fr-next">
                <b>After you confirm you can go on to</b>
                <ul className="fr-next__list">
                  {nextSteps.map((h) => <li key={h.kind}>{h.label}</li>)}
                </ul>
                <span className="muted">These are separate actions that already exist, each with its own permission. Nothing happens until you take one.</span>
              </div>
            ) : null}
          </>
        )}
        {touched && problem && !done ? <div id="fr-problem" className="alert-error" role="alert">{problem}</div> : null}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
