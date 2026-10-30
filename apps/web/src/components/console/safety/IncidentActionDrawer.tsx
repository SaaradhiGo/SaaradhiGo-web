'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { FALLBACK_SUSPEND_REASONS } from '@/lib/drivers';
import { FALLBACK_BLOCK_REASONS } from '@/lib/riders';
import { newIdempotencyKey } from '@/lib/trips';
import {
  OUTCOME_LABEL, STATUS_LABEL, emergencyLine, type IncidentDetail, type IncidentStatus,
} from '@/lib/safety';
import { Drawer } from '@/components/console/ui';

export type IncidentAction =
  | 'assign' | 'note' | 'status' | 'link' | 'suspend' | 'block' | 'police' | 'close';

export const ACTION_TITLE: Record<IncidentAction, string> = {
  assign: 'Assign', note: 'Add a note', status: 'Change status', link: 'Link a record',
  suspend: 'Suspend driver', block: 'Block rider', police: 'Refer to police', close: 'Close incident',
};

const CONSEQUENCE: Record<IncidentAction, string> = {
  assign: 'Only an operator who can respond to safety incidents where this one sits can be assigned.',
  note: 'Added to the incident timeline. Operators only: the rider and driver never see it.',
  status: 'Moves the incident between open, investigating and action taken. Closing has its own step.',
  link: 'Attach a driver, rider, trip, support ticket or SOS you can see. A link does not give anyone access to it.',
  suspend: 'Takes the driver off the road now, through the same audited suspension the Drivers page uses. They cannot go online or accept trips until reinstated. It changes no fare and no earnings.',
  block: 'Stops the rider requesting rides, through the same audited block the Riders page uses. They can still sign in, pay what they owe, contact support and raise an SOS. A trip under way is not affected.',
  police: 'Records that you referred this incident to the police. SaaradhiGo does not contact emergency services for you: ring the number below, then record it here.',
  close: 'Closing needs a summary and an outcome, and is recorded permanently. An incident with a live SOS cannot be closed until the SOS is resolved or marked a false alarm.',
};

const LINK_KINDS: Array<[string, string]> = [
  ['driver', 'Driver'], ['rider', 'Rider'], ['trip', 'Trip'], ['ticket', 'Support ticket'], ['sos', 'SOS event'],
];

type Assignee = { id: number; label: string; me: boolean; assigned: boolean };

const failure = (err: unknown) =>
  err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.';

/**
 * One drawer for the writes on an incident. Each reads the consequence back
 * before the button, asks for what the server requires, and shows the
 * server's own answer when it refuses. Account actions (suspend, block)
 * call the existing audited services; nothing here moves money.
 */
export function IncidentActionDrawer({
  action, incident, onClose, onDone,
}: {
  action: IncidentAction; incident: IncidentDetail;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const base = `/safety/admin/incidents/${incident.id}`;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);

  // assign
  const [assignees, setAssignees] = useState<Assignee[] | null>(null);
  const [assignTo, setAssignTo] = useState<string>(incident.assigned_to ? String(incident.assigned_to) : 'none');
  // status
  const [status, setStatus] = useState<IncidentStatus>(incident.status === 'closed' ? 'open' : incident.status);
  // link
  const [linkKind, setLinkKind] = useState('driver');
  const [linkId, setLinkId] = useState('');
  // suspend / block
  const drivers = incident.people.drivers.filter((d) => d.can_suspend);
  const riders = incident.people.riders.filter((r) => r.can_block);
  const [driverId, setDriverId] = useState(String(drivers[0]?.id ?? ''));
  const [riderId, setRiderId] = useState(String(riders[0]?.id ?? ''));
  const [reason, setReason] = useState('safety');
  // police
  const [reference, setReference] = useState('');
  // close
  const [outcome, setOutcome] = useState('');

  useEffect(() => {
    if (action !== 'assign') return;
    let live = true;
    api.get<{ results: Assignee[] }>(`${base}/assignees/`)
      .then((r) => { if (live) setAssignees(r.results ?? []); })
      .catch((err) => { if (live) { setAssignees([]); setError(failure(err)); } });
    return () => { live = false; };
  }, [action, base]);

  const reasons = action === 'suspend' ? FALLBACK_SUSPEND_REASONS : FALLBACK_BLOCK_REASONS;
  const needsText = action === 'note' || action === 'close'
    || ((action === 'suspend' || action === 'block') && reason === 'other');
  const ready = !busy && (!needsText || text.trim() !== '')
    && (action !== 'link' || /^\d+$/.test(linkId.trim()))
    && (action !== 'suspend' || driverId !== '')
    && (action !== 'block' || riderId !== '')
    && (action !== 'close' || outcome !== '');

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      let done = '';
      if (action === 'assign') {
        await api.post(`${base}/assign/`, { assigned_to: assignTo === 'none' ? 'none' : Number(assignTo) });
        done = assignTo === 'none' ? 'The incident is unassigned.' : 'Assigned.';
      } else if (action === 'note') {
        await api.post(`${base}/note/`, { body: text.trim(), idempotency_key: key });
        done = 'Note added.';
      } else if (action === 'status') {
        await api.post(`${base}/status/`, { status, note: text.trim() });
        done = `Status is now ${STATUS_LABEL[status].toLowerCase()}.`;
      } else if (action === 'link') {
        await api.post(`${base}/link/`, { kind: linkKind, id: Number(linkId) });
        done = 'Linked.';
      } else if (action === 'suspend') {
        await api.post(`${base}/suspend-driver/`, { driver_id: Number(driverId), reason_code: reason, note: text.trim() });
        done = 'The driver is suspended.';
      } else if (action === 'block') {
        await api.post(`${base}/block-rider/`, { rider_id: Number(riderId), reason_code: reason, note: text.trim() });
        done = 'The rider is blocked from requesting rides.';
      } else if (action === 'police') {
        await api.post(`${base}/refer-police/`, { reference: reference.trim(), note: text.trim() });
        done = 'Recorded as referred to police.';
      } else {
        await api.post(`${base}/close/`, { summary: text.trim(), outcome });
        done = 'The incident is closed.';
      }
      onDone(done);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  const blockers = incident.actions.close_blockers;
  const label = action === 'close' ? 'Closing summary (required)'
    : needsText ? 'Note (required)' : 'Note (optional)';

  return (
    <Drawer
      open
      title={`${ACTION_TITLE[action]} · incident #${incident.id}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button
            type="button" className="sg-btn sg-btn--primary sg-btn--sm"
            onClick={() => void submit()}
            disabled={!ready || (action === 'close' && blockers.length > 0)}
          >
            {busy ? 'Working…' : action === 'police' ? 'Mark as referred to police' : ACTION_TITLE[action]}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        <div className="ops-confirm">
          <b>{ACTION_TITLE[action]}</b>
          <span>{CONSEQUENCE[action]}</span>
        </div>

        {action === 'assign' && (
          assignees === null ? <p className="help" aria-live="polite">Loading responders…</p> : (
            <div className="ops-filterset">
              <fieldset>
                <legend>Assign to</legend>
                <label><input type="radio" name="assignee" value="none" checked={assignTo === 'none'} onChange={() => setAssignTo('none')} />Nobody (unassigned)</label>
                {assignees.map((a) => (
                  <label key={a.id}>
                    <input type="radio" name="assignee" value={a.id} checked={assignTo === String(a.id)} onChange={() => setAssignTo(String(a.id))} />
                    {a.label}{a.me ? ' (me)' : ''}
                  </label>
                ))}
              </fieldset>
            </div>
          )
        )}

        {action === 'status' && (
          <div className="ops-filterset">
            <fieldset>
              <legend>Status</legend>
              {(['open', 'investigating', 'action_taken'] as IncidentStatus[]).map((s) => (
                <label key={s}><input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} />{STATUS_LABEL[s]}</label>
              ))}
            </fieldset>
          </div>
        )}

        {action === 'link' && (
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="link-kind">Kind</label>
            <select id="link-kind" className="ops-select" value={linkKind} onChange={(e) => setLinkKind(e.target.value)}>
              {LINK_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="ops-form__label" htmlFor="link-id">Number</label>
            <input id="link-id" className="ops-select" inputMode="numeric" value={linkId} onChange={(e) => setLinkId(e.target.value)} size={10} />
          </div>
        )}

        {action === 'suspend' && (
          drivers.length === 0 ? <p className="help">No linked driver can be suspended by you here.</p> : (
            <div className="ops-form__row">
              <label className="ops-form__label" htmlFor="act-driver">Driver</label>
              <select id="act-driver" className="ops-select" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.driver_name || `Driver #${d.id}`}</option>)}
              </select>
            </div>
          )
        )}

        {action === 'block' && (
          riders.length === 0 ? <p className="help">No linked rider can be blocked by you here.</p> : (
            <div className="ops-form__row">
              <label className="ops-form__label" htmlFor="act-rider">Rider</label>
              <select id="act-rider" className="ops-select" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                {riders.map((r) => <option key={r.id} value={r.id}>{r.rider_name || `Rider #${r.id}`}</option>)}
              </select>
            </div>
          )
        )}

        {(action === 'suspend' || action === 'block') && (
          <div className="ops-filterset">
            <fieldset>
              <legend>Reason</legend>
              {Object.entries(reasons).map(([v, l]) => (
                <label key={v}><input type="radio" name="act-reason" value={v} checked={reason === v} onChange={() => setReason(v)} />{l}</label>
              ))}
            </fieldset>
          </div>
        )}

        {action === 'police' && (
          <>
            <div className="ops-emergency" role="group" aria-label="Emergency numbers">
              <b>{incident.emergency.country ? `Emergency numbers · ${incident.emergency.country}` : 'Emergency numbers'}</b>
              {incident.emergency.configured && incident.emergency.numbers.length > 0 ? (
                <ul>
                  {incident.emergency.numbers.map((n) => (
                    <li key={`${n.label}-${n.number}`}><span>{n.label}</span> <a href={`tel:${n.number}`}>{n.number}</a></li>
                  ))}
                </ul>
              ) : (
                <span>{emergencyLine(incident.emergency)}. Ask a Super Admin to add them under Safety settings.</span>
              )}
            </div>
            <label className="ops-form__label" htmlFor="police-ref">Reference (optional)</label>
            <input id="police-ref" className="ops-select" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
          </>
        )}

        {action === 'close' && (
          <>
            {blockers.length > 0 && (
              <div className="alert-error" role="alert">
                {blockers.map((b) => <div key={b.code}>{b.message}</div>)}
              </div>
            )}
            <div className="ops-form__row">
              <label className="ops-form__label" htmlFor="close-outcome">Outcome (required)</label>
              <select id="close-outcome" className="ops-select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="">Choose an outcome</option>
                {incident.vocabulary.outcomes.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o] ?? o}</option>)}
              </select>
            </div>
          </>
        )}

        {action !== 'assign' && action !== 'link' && (
          <>
            <label className="ops-form__label" htmlFor="act-text">{label}</label>
            <textarea id="act-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
