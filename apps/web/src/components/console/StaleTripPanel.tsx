'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  type EndRule, type PanelModel, type ReleasePreview, type StaleActions, type StaleDetail,
  type StaleResult, type StaleStep,
  consequence, failureText, outcomeText, previewRows, reasonProblem, releaseReady, silentFor,
  staleReasonText,
} from '@/lib/staleTrip';
import { cityTime } from '@/lib/trips';
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
 * offers the two actions the server said this operator can take now. Releasing a
 * driver from a STARTED trip asks for a reason code, which decides what the rider
 * pays and who pays the driver; the dialog shows the server's own figures for the
 * chosen code before anything is sent.
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
  const started = step === 'release_driver' && actions.release_case === 'C';
  const [code, setCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });

  const problem = reasonProblem(text, actions.reason_min_length, actions.reason_max_length);
  const rule: EndRule | null = actions.reason_codes.find((c) => c.code === code)?.rule ?? null;

  // The figures come from the server for the chosen code, never from this page.
  useEffect(() => {
    if (!started || !code) { setPreview({ status: 'idle' }); return; }
    let live = true;
    setPreview({ status: 'loading' });
    api.get<ReleasePreview>(
      `/ride/admin/trips/${tripId}/stale/release-preview/?reason_code=${encodeURIComponent(code)}`,
    ).then((data) => { if (live) setPreview({ status: 'ready', data }); })
      .catch((err) => { if (live) setPreview({ status: 'error', message: failureText(err).message }); });
    return () => { live = false; };
  }, [started, code, tripId, attempt]);

  const ready = started
    ? preview.status === 'ready' && releaseReady('C', code, text, actions.reason_min_length, actions.reason_max_length)
    : true;

  async function submit() {
    setTouched(true);
    if (problem || (started && !ready)) return;
    setBusy(true); setFailure(null);
    try {
      const result = await api.post<StaleResult>(
        `/ride/admin/trips/${tripId}/stale/${PATH[step]}/`,
        started ? { reason: text.trim(), reason_code: code } : { reason: text.trim() });
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
            {busy ? 'Working…' : started ? 'End trip and release driver' : TITLE[step]}
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
              <span>{consequence(step, actions.release_case, rule)}</span>
            </div>
            {started ? (
              <>
                <div className="ops-filterset">
                  <fieldset>
                    <legend>Why is this trip being ended? (required)</legend>
                    {actions.reason_codes.map((c) => (
                      <label key={c.code}>
                        <input
                          type="radio" name="stale-reason-code" value={c.code}
                          checked={code === c.code} onChange={() => setCode(c.code)}
                        />
                        {c.label}
                        <span className="help"> {c.rule === 'platform_funded' ? '· rider not charged, SaaradhiGo pays the driver' : '· rider pays for the distance driven'}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>
                <PreviewBlock state={preview} chosen={code !== null} onRetry={() => setAttempt((n) => n + 1)} />
              </>
            ) : null}
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
            <b>Not done</b>
            <div>{failure.message}</div>
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ReleasePreview };

/** What the release will do for the chosen code, in the server's own numbers. */
function PreviewBlock({ state, chosen, onRetry }: {
  state: PreviewState; chosen: boolean; onRetry: () => void;
}) {
  return (
    <div className="ops-confirm" aria-live="polite" aria-busy={state.status === 'loading' ? true : undefined}>
      <b>The figures</b>
      {state.status === 'idle' ? (
        <span className="help">{chosen ? '' : 'Choose a reason to see what the rider pays and what the driver earns.'}</span>
      ) : null}
      {state.status === 'loading' ? <span className="help">Working out the figures…</span> : null}
      {state.status === 'error' ? (
        <span role="alert">
          {state.message}{' '}
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onRetry}>Try again</button>
        </span>
      ) : null}
      {state.status === 'ready' ? (
        <Facts>
          {previewRows(state.data).map((row) => (
            <Fact key={row.label} label={row.label}>
              {row.strong ? <b>{row.value}</b> : row.value}
            </Fact>
          ))}
        </Facts>
      ) : null}
    </div>
  );
}
