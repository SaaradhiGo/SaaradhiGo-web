'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import {
  type PanelModel, type StaleActions, type StaleDetail, type StaleResult, type StaleStep,
  consequence, failureText, outcomeText, reasonProblem, silentFor, staleReasonText,
} from '@/lib/staleTrip';
import { cityTime } from '@/lib/trips';
import { PageButtonLink } from '@/components/console/PageLink';
import { Drawer, Fact, Facts, Panel, Pill } from '@/components/console/ui';

const TITLE: Record<StaleStep, string> = {
  mark_reviewed: 'Mark reviewed',
  release_driver: 'Release driver',
};
const PATH: Record<StaleStep, string> = {
  mark_reviewed: 'mark-reviewed',
  release_driver: 'release-driver',
};

/**
 * The Stale trip panel on a trip's detail page.
 *
 * It says why the trip is stale and how long the driver has been silent, and it
 * offers the two actions the server said this operator can take now. A started
 * trip cannot be ended from here (it needs the fare policy), so the panel shows
 * the server's refusal as text with the Safety and Support routes instead of a
 * button that would fail.
 */
export function StaleTripPanel({
  model, tripId, reason, actions, detail, timeZone, onDone,
}: {
  model: PanelModel;
  tripId: number;
  reason: string | null;
  actions: StaleActions;
  detail: StaleDetail | null | undefined;
  timeZone: string | undefined;
  /** Called after an action succeeded, so the page can refresh the trip. */
  onDone: (message: string) => void;
}) {
  const [step, setStep] = useState<StaleStep | null>(null);
  // The dialog outlives the panel: once an action succeeds the trip is reloaded and
  // may no longer be stale, but the operator still reads the outcome in the dialog.
  return (
    <>
      {model.show ? <Panel title="Stale trip">
        <p className="help" style={{ marginTop: 0 }}>
          <Pill tone="wait">stale</Pill> {staleReasonText(reason)}.
        </p>
        <Facts>
          <Fact label="Driver silent for">
            <b>{silentFor(detail?.silent_seconds)}</b>
          </Fact>
          {detail?.last_activity_at ? (
            <Fact label="Last activity">{cityTime(detail.last_activity_at, timeZone)}</Fact>
          ) : null}
          {detail?.reviewed_at ? (
            <Fact label="Last reviewed">
              {cityTime(detail.reviewed_at, timeZone)}
              {detail.reviewed_by ? ` by ${detail.reviewed_by.label}` : ''}
            </Fact>
          ) : null}
        </Facts>

        {model.refusal ? (
          <div className="ops-confirm mt-3" role="note">
            <b>The driver cannot be released from a started ride here</b>
            <span>{model.refusal.message}</span>
            <span className="ops-form__row">
              {model.routes.includes('safety') ? <PageButtonLink page="safety" href="/safety-ops">Open Safety</PageButtonLink> : null}
              {model.routes.includes('support') ? <PageButtonLink page="support" href="/support">Open Support</PageButtonLink> : null}
            </span>
          </div>
        ) : null}

        {model.readOnly ? (
          <p className="help mt-3">You can see this, but your role cannot act on stale trips.</p>
        ) : null}

        {model.buttons.length > 0 ? (
          <div className="ops-form__row mt-3">
            {model.buttons.map((b) => (
              <button
                key={b} type="button"
                className={`sg-btn ${b === 'release_driver' ? 'sg-btn--primary' : 'sg-btn--secondary'} sg-btn--sm`}
                onClick={() => setStep(b)}
              >
                {TITLE[b]}…
              </button>
            ))}
          </div>
        ) : null}
      </Panel> : null}

      {step ? (
        <StaleDrawer
          step={step} tripId={tripId} actions={actions}
          onClose={() => setStep(null)}
          onDone={(message) => { onDone(message); }}
        />
      ) : null}
    </>
  );
}

/**
 * The dialog for one action: what will happen, a required reason, and the server's
 * answer shown in the dialog itself (a refusal stays on screen until read).
 */
export function StaleDrawer({
  step, tripId, actions, onClose, onDone,
}: {
  step: StaleStep; tripId: number; actions: StaleActions;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<{ code: string | null; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const problem = reasonProblem(text, actions.reason_min_length, actions.reason_max_length);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setFailure(null);
    try {
      const result = await api.post<StaleResult>(
        `/ride/admin/trips/${tripId}/stale/${PATH[step]}/`, { reason: text.trim() });
      const message = outcomeText(step, result);
      setDone(message);
      onDone(message);
    } catch (err) {
      setFailure(failureText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${TITLE[step]} · trip #${tripId}`}
      onClose={onClose}
      footer={done || failure?.code ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Working…' : TITLE[step]}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {done ? (
          <div className="alert-success" role="status"><b>{done}</b></div>
        ) : (
          <>
            <div className="ops-confirm">
              <b>What will happen</b>
              <span>{consequence(step, actions.release_case)}</span>
            </div>
            <label className="ops-form__label" htmlFor="stale-reason">Reason (required)</label>
            <textarea
              id="stale-reason" className="input" rows={4} value={text}
              maxLength={actions.reason_max_length + 100}
              aria-invalid={touched && problem ? true : undefined}
              aria-describedby="stale-reason-help"
              onChange={(e) => setText(e.target.value)}
            />
            <p className="help" id="stale-reason-help">
              Recorded with your name on the trip&apos;s audit trail. {actions.reason_min_length} to {actions.reason_max_length} characters.
            </p>
            {touched && problem ? <p className="alert-error" role="alert">{problem}</p> : null}
          </>
        )}
        {failure ? (
          <div className="alert-error" role="alert">
            <b>{failure.code === 'started_trip_needs_policy' ? 'Not possible from here' : 'Not done'}</b>
            <div>{failure.message}</div>
            {failure.code === 'started_trip_needs_policy' ? (
              <div className="ops-form__row mt-2">
                <PageButtonLink page="safety" href="/safety-ops">Open Safety</PageButtonLink>
                <PageButtonLink page="support" href="/support">Open Support</PageButtonLink>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
