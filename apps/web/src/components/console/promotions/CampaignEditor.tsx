'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  KIND_WORDS, PROGRESS_WORDS, REDEMPTION_WORDS, REFERRAL_STATUS_WORDS, actionsFor, blankForm,
  canWrite, matchedWords, costWords, fromCampaign, placesFor, projectCost, raiseProblem, referralTone, submitProblem,
  termsWords, toPayload, validateForm, writeCapability, minorOf,
  type Activity, type Audience, type Campaign, type DraftForm, type Kind, type Options, type Problems,
} from '@/lib/promotions';
import { formatMinor, interpretWrite } from '@/lib/trips';
import { Drawer, ErrorState, Fact, Facts, Pill, Skeleton } from '@/components/console/ui';
import { BudgetBar, StateTag } from '@/components/console/promotions';
import { messageOf, type Notice } from '@/components/console/notifications';

/**
 * The campaign drawer: a form for a draft (with the cost it commits the platform to, counted as you
 * type), and for a saved campaign its state, budget, what it has done and what can be done to it.
 *
 * Going live needs a second admin and so does raising a budget; pausing, resuming and cancelling do
 * not (they only reduce spend) and are audited. A rider promo is paid by the platform: the form says
 * so, because "who pays" is the question every checker asks.
 */
export function CampaignEditor({ kind, campaignId, onClose, onDone, onOpen }: {
  kind: Kind;
  campaignId: number | null;
  onClose: () => void;
  onDone: (n: Notice) => void;
  onOpen: (id: number) => void;
}) {
  const access = useAdminAccess();
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState<DraftForm>(() => {
    const f = blankForm(kind, canWrite(access, kind, 'rider') ? 'rider' : 'driver');
    return f;
  });
  const [shown, setShown] = useState(false);          // problems appear after the first attempt
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [raise, setRaise] = useState<{ budget: string; reason: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (campaignId === null) return;
    setLoadError(null);
    try {
      const d = await api.get<Campaign>(`/promotions/admin/campaigns/${campaignId}/`);
      setDetail(d);
      setForm(fromCampaign(d));
    } catch (err) {
      setLoadError(messageOf(err, 'That campaign could not be loaded.'));
    }
  }, [campaignId]);
  useEffect(() => { void load(); }, [load]);

  const audience: Audience = form.audience;
  const mayWrite = canWrite(access, detail?.kind ?? kind, detail ? (detail.config.audience as Audience | undefined) : audience)
    || (kind === 'referral' && campaignId === null && (canWrite(access, 'referral', 'rider') || canWrite(access, 'referral', 'driver')));
  const editable = mayWrite && (campaignId === null || (detail?.state === 'draft' && !detail.is_legacy));

  useEffect(() => {
    if (!editable) return;
    api.get<Options>('/promotions/admin/options/').then(setOptions).catch(() => setOptions({ places: [], zones: [], vehicle_types: [] }));
  }, [editable]);

  // What it has done: redemptions, progress or referrals. Not for a draft: it has done nothing.
  useEffect(() => {
    if (!detail || detail.state === 'draft') return;
    setActivityError(null);
    api.get<Activity>(`/promotions/admin/campaigns/${detail.id}/activity/?limit=50`)
      .then(setActivity).catch((err) => setActivityError(messageOf(err, 'The activity could not be loaded.')));
  }, [detail]);

  const places = useMemo(() => placesFor(options, kind, audience), [options, kind, audience]);
  // One place to choose from: choose it.
  useEffect(() => {
    if (editable && campaignId === null && !form.scope && places.length === 1) {
      setForm((f) => ({ ...f, scope: places[0].code }));
    }
  }, [editable, campaignId, form.scope, places]);

  const place = places.find((p) => p.code === form.scope) ?? null;
  const currency = detail?.currency ?? place?.currency ?? 'INR';
  const problems: Problems = useMemo(() => validateForm(form, currency), [form, currency]);
  const cost = useMemo(() => projectCost(form, currency), [form, currency]);
  const set = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: keyof Problems) => (shown ? problems[k] : undefined);

  async function save(): Promise<number | null> {
    setShown(true);
    if (Object.keys(problems).length > 0) {
      setProblem('Fix the highlighted fields first. Nothing was saved.');
      return null;
    }
    setBusy(true); setProblem(null);
    try {
      const body = toPayload(form, currency);
      if (campaignId === null) {
        const created = await api.post<Campaign>('/promotions/admin/campaigns/', body);
        return created.id;
      }
      await api.patch(`/promotions/admin/campaigns/${campaignId}/`, body);
      return campaignId;
    } catch (e) {
      setProblem(messageOf(e, 'That did not save. Nothing was changed.'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const id = await save();
    if (id === null) return;
    if (campaignId === null) onOpen(id); else { await load(); onDone({ text: 'The draft was saved.', kind: 'done' }); }
  }

  async function submit() {
    const why = submitProblem(form.reason);
    if (why) { setShown(true); setProblem(why); return; }
    const id = await save();
    if (id === null) return;
    setBusy(true); setProblem(null);
    try {
      const out = await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/promotions/admin/campaigns/${id}/submit/`, { reason: form.reason.trim() });
      const result = interpretWrite(out as never, 'The campaign is live.');
      onDone({ text: result.message, kind: result.kind === 'pending' ? 'pending' : 'done' });
    } catch (e) {
      setProblem(messageOf(e, 'That did not go through. Nothing went live.'));
      if (campaignId === null) onOpen(id);
    } finally {
      setBusy(false);
    }
  }

  async function act(path: 'pause' | 'resume' | 'cancel', done: string) {
    if (campaignId === null) return;
    setBusy(true); setProblem(null);
    try {
      await api.post(`/promotions/admin/campaigns/${campaignId}/${path}/`, {
        reason: form.reason.trim() || `${path} from the console`,
      });
      onDone({ text: done, kind: 'done' });
    } catch (e) {
      setProblem(messageOf(e, 'That did not go through. Nothing was changed.'));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  async function sendRaise() {
    if (!detail || !raise) return;
    const why = raiseProblem(raise.budget, detail.budget.budget_minor, currency) ?? submitProblem(raise.reason);
    if (why) { setProblem(why); return; }
    setBusy(true); setProblem(null);
    try {
      const out = await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/promotions/admin/campaigns/${detail.id}/budget-increase/`,
        { budget_minor: minorOf(raise.budget, currency), reason: raise.reason.trim() });
      const result = interpretWrite(out as never, 'The budget was raised.');
      onDone({ text: result.message, kind: result.kind === 'pending' ? 'pending' : 'done' });
    } catch (e) {
      setProblem(messageOf(e, 'That did not go through. The budget is unchanged.'));
    } finally {
      setBusy(false);
    }
  }

  const actions = detail && mayWrite ? actionsFor(detail) : [];
  const title = campaignId === null ? `New ${KIND_WORDS[kind].toLowerCase()}` : detail ? detail.name : KIND_WORDS[kind];
  const words = costWords(cost, kind, currency);

  const footer = editable ? (
    <>
      {campaignId !== null && actions.includes('cancel') ? (
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
          onClick={() => setConfirmCancel(true)}>Cancel campaign</button>
      ) : null}
      <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
      <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void submit()}>Submit for approval</button>
    </>
  ) : detail && actions.length > 0 ? (
    <>
      {actions.includes('cancel') ? (
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel campaign</button>
      ) : null}
      {actions.includes('raise') && !raise ? (
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
          onClick={() => setRaise({ budget: '', reason: '' })}>Raise the budget…</button>
      ) : null}
      {actions.includes('pause') ? (
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
          onClick={() => void act('pause', 'The campaign is paused. It takes no new applications; booked trips are still honoured.')}>Pause</button>
      ) : null}
      {actions.includes('resume') ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy}
          onClick={() => void act('resume', 'The campaign is running again on its approved terms.')}>Resume</button>
      ) : null}
    </>
  ) : undefined;

  return (
    <Drawer open wide onClose={onClose} title={title} footer={footer}>
      {loadError ? <ErrorState title="That campaign could not be loaded" detail={loadError} onRetry={() => void load()} />
        : campaignId !== null && !detail ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the campaign</span><Skeleton kind="row" count={4} /></div>
        ) : (
          <div className="nf-editor">
            {detail ? <Summary c={detail} /> : null}

            {editable ? (
              <FormBody kind={kind} form={form} set={set} err={err} places={places} options={options}
                currency={currency} cost={cost} words={words} access={access} editingExisting={campaignId !== null} />
            ) : detail ? (
              <ReadOnly c={detail} />
            ) : null}

            {detail && detail.state !== 'draft' ? (
              <ActivityPanel c={detail} activity={activity} error={activityError} />
            ) : null}

            {raise && detail ? (
              <section className="ops-form" aria-label="Raise the budget">
                <h3 className="ops-subhead">Raise the budget</h3>
                <p className="help m-0">A budget only goes up, and a second admin must approve it. Nothing changes until they do. It is {formatMinor(detail.budget.budget_minor, currency)} now.</p>
                <label className="ops-form__label" htmlFor="pm-raise">New total budget ({currency})</label>
                <input id="pm-raise" className="input" inputMode="decimal" value={raise.budget}
                  onChange={(e) => setRaise({ ...raise, budget: e.target.value })} />
                <label className="ops-form__label" htmlFor="pm-raise-why">Why (kept in the audit log)</label>
                <textarea id="pm-raise-why" className="input" rows={2} value={raise.reason}
                  onChange={(e) => setRaise({ ...raise, reason: e.target.value })} />
                <div className="nf-inline">
                  <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void sendRaise()}>Send for approval</button>
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setRaise(null)}>Never mind</button>
                </div>
              </section>
            ) : null}

            {confirmCancel ? (
              <div className="ops-confirm" role="alertdialog" aria-label="Cancel this campaign">
                <b>Cancel this campaign?</b>
                <span>It stops taking new applications at once. Trips that already hold a discount, and rewards already earned, are still honoured. This cannot be undone.</span>
                {detail && detail.state !== 'draft' ? (
                  <>
                    <label className="ops-form__label" htmlFor="pm-cancel-why">Why (kept in the audit log)</label>
                    <input id="pm-cancel-why" className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
                  </>
                ) : null}
                <div className="nf-inline">
                  <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy}
                    onClick={() => void act('cancel', 'The campaign was cancelled. Booked trips are still honoured.')}>Yes, cancel it</button>
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setConfirmCancel(false)}>Keep it</button>
                </div>
              </div>
            ) : null}

            {problem ? <div className="alert-error" role="alert">{problem}</div> : null}
          </div>
        )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------

function Summary({ c }: { c: Campaign }) {
  return (
    <>
      <Facts>
        <Fact label="State"><StateTag state={c.state} /></Fact>
        <Fact label="Where">{c.scope_name ?? '—'}</Fact>
        <Fact label="Runs">{stamp(c.starts_at)} to {stamp(c.ends_at)}</Fact>
        <Fact label="Asked by">{c.created_by.label || '—'}</Fact>
        {c.approval_request_id ? <Fact label="Approval request">#{c.approval_request_id}</Fact> : null}
        {c.budget_request_id ? <Fact label="Budget request">#{c.budget_request_id}</Fact> : null}
      </Facts>
      {c.state !== 'draft' ? (
        <section aria-label="Budget">
          <h3 className="ops-subhead">Budget</h3>
          <BudgetBar budget={c.budget} />
        </section>
      ) : null}
      {c.state === 'pending_approval' ? (
        <div className="ops-confirm" role="status">
          <b>Waiting for a second admin</b>
          <span>Nothing goes live until a different admin approves request #{c.approval_request_id}. You can still cancel it.</span>
        </div>
      ) : null}
      {c.state === 'exhausted' ? (
        <div className="ops-confirm" role="status">
          <b>The budget is used up</b>
          <span>The campaign stopped by itself. Trips that already held a discount are still honoured. A raised budget, approved by a second admin, starts it again.</span>
        </div>
      ) : null}
      {c.budget.overshoot_minor > 0 ? (
        <div className="nf-refusal" role="status">
          <b>{formatMinor(c.budget.overshoot_minor, c.currency)} over the cap</b>
          <span>Discounts reserved on trips already booked were honoured past the budget. Finance has been alerted.</span>
        </div>
      ) : null}
      {c.is_legacy ? (
        <div className="nf-refusal" role="status">
          <b>An existing {c.kind === 'rider_promo' ? 'code' : 'quest'}, wrapped</b>
          <span>
            {c.kind === 'rider_promo'
              ? 'It was created before budgets existed, so it has no budget and no approval. You can pause or cancel it; to cap it, launch a new campaign.'
              : 'It was created before budgets existed. Rewards for it are not paid by the new engine; launch a new incentive to pay one.'}
          </span>
        </div>
      ) : null}
    </>
  );
}

function ReadOnly({ c }: { c: Campaign }) {
  return (
    <section aria-label="Terms">
      <h3 className="ops-subhead">Terms</h3>
      <Facts>
        <Fact label="Kind">{KIND_WORDS[c.kind]}</Fact>
        <Fact label="Terms">{termsWords(c)}</Fact>
        {c.description ? <Fact label="About">{c.description}</Fact> : null}
        <Fact label="Hard cap">{c.budget.strict_cap ? 'Yes: a discount that does not fit is refused' : 'No: the last one may cross the cap'}</Fact>
        {c.projection?.max_redemptions != null ? (
          <Fact label="The budget funds">about {c.projection.max_redemptions}{c.projection.average_minor ? ` at ${formatMinor(c.projection.average_minor, c.currency)} each` : ''}</Fact>
        ) : null}
        {c.reason ? <Fact label="Reason">{c.reason}</Fact> : null}
      </Facts>
      {c.kind === 'rider_promo' ? (
        <p className="help m-0">Paid by the platform. The rider pays the fare less the discount; the driver&apos;s earnings and commission are on the full fare.</p>
      ) : c.kind === 'driver_incentive' ? (
        <p className="help m-0">Paid in the weekly payout as its own line, with no commission. Tax: {c.tax}.</p>
      ) : (
        <p className="help m-0">Paid only after the new person completes the trips, and never across the same device, phone number or payment instrument.</p>
      )}
    </section>
  );
}

function ActivityPanel({ c, activity, error }: { c: Campaign; activity: Activity | null; error: string | null }) {
  const currency = c.currency;
  return (
    <section aria-label="Activity">
      <h3 className="ops-subhead">{c.kind === 'rider_promo' ? 'Redemptions' : c.kind === 'driver_incentive' ? 'Driver progress' : 'Referrals'}</h3>
      {error ? <ErrorState title="The activity could not be loaded" detail={error} />
        : activity === null ? <Skeleton kind="row" count={3} />
          : activity.results.length === 0 ? (
            <p className="help m-0">Nothing yet. {c.state === 'live' ? 'It is live and waiting for its first use.' : ''}</p>
          ) : activity.activity === 'redemptions' ? (
            <div className="pm-scroll"><table className="ops-table pm-activity">
              <caption className="sr-only">Redemptions</caption>
              <thead><tr><th scope="col">Rider</th><th scope="col">Trip</th><th scope="col">Discount</th><th scope="col">State</th><th scope="col">When</th></tr></thead>
              <tbody>
                {activity.results.map((r) => (
                  <tr key={r.id}><td>{r.who}</td><td>{r.trip_id ? `#${r.trip_id}` : '—'}</td>
                    <td>{formatMinor(r.discount_minor, currency)}</td><td>{REDEMPTION_WORDS[r.state]}</td><td>{stamp(r.created_at)}</td></tr>
                ))}
              </tbody>
            </table></div>
          ) : activity.activity === 'progress' ? (
            <div className="pm-scroll"><table className="ops-table pm-activity">
              <caption className="sr-only">Driver progress</caption>
              <thead><tr><th scope="col">Driver</th><th scope="col">Trips</th><th scope="col">Status</th><th scope="col">Reward</th></tr></thead>
              <tbody>
                {activity.results.map((r) => (
                  <tr key={r.id}><td>{r.who}</td>
                    <td>{r.trips_counted} of {String(c.config.target_trips ?? '?')}</td>
                    <td>{PROGRESS_WORDS[r.status]}</td>
                    <td>{r.reward_minor ? formatMinor(r.reward_minor, currency) : '—'}</td></tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <div className="pm-scroll"><table className="ops-table pm-activity">
              <caption className="sr-only">Referrals</caption>
              <thead><tr><th scope="col">Referrer</th><th scope="col">Referred</th><th scope="col">Trips</th><th scope="col" className="pm-col-status">Status</th><th scope="col">Rewards</th></tr></thead>
              <tbody>
                {activity.results.map((r) => (
                  <tr key={r.id} className={r.status === 'blocked' ? 'pm-row--blocked' : undefined}>
                    <td>{r.referrer}</td><td>{r.referee}</td>
                    <td>{r.trips_completed} of {r.required_trips}</td>
                    <td className="pm-col-status">
                      <Pill tone={referralTone(r.status)}>{REFERRAL_STATUS_WORDS[r.status]}</Pill>
                      {r.status === 'blocked' ? <span className="pm-sub">{matchedWords(r.blocked_signals)}</span> : null}
                    </td>
                    <td>{r.status === 'rewarded'
                      ? `${formatMinor(r.referrer_reward_minor, currency)} + ${formatMinor(r.referee_reward_minor, currency)}`
                      : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      {activity && activity.count > activity.results.length ? (
        <p className="help m-0">Showing the latest {activity.results.length} of {activity.count}.</p>
      ) : null}
    </section>
  );
}

function FormBody({ kind, form, set, err, places, options, currency, cost, words, access, editingExisting }: {
  kind: Kind;
  form: DraftForm;
  set: <K extends keyof DraftForm>(k: K, v: DraftForm[K]) => void;
  err: (k: keyof Problems) => string | undefined;
  places: ReturnType<typeof placesFor>;
  options: Options | null;
  currency: string;
  cost: ReturnType<typeof projectCost>;
  words: string | null;
  access: ReturnType<typeof useAdminAccess>;
  editingExisting: boolean;
}) {
  const zones = (options?.zones ?? []).filter((z) => {
    const p = places.find((x) => x.code === form.scope);
    return !p || z.country === p.country;
  });
  const field = (id: string, label: string, error: string | undefined, input: React.ReactNode, help?: string) => (
    <div className="nf-field">
      <label className="ops-form__label" htmlFor={id}>{label}</label>
      {input}
      {help && !error ? <span className="help">{help}</span> : null}
      {error ? <span className="pm-error" id={`${id}-err`}>{error}</span> : null}
    </div>
  );
  const text = (id: string, label: string, key: keyof DraftForm, error: string | undefined,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string) => field(id, label, error, (
    <input id={id} className="input" value={String(form[key])} aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-err` : undefined}
      onChange={(e) => set(key, e.target.value as never)} {...props} />
  ), help);
  const money = (id: string, label: string, key: keyof DraftForm, error: string | undefined, help?: string) =>
    text(id, `${label} (${currency})`, key, error, { inputMode: 'decimal', placeholder: '0.00' }, help);
  const whole = (id: string, label: string, key: keyof DraftForm, error: string | undefined, help?: string) =>
    text(id, label, key, error, { inputMode: 'numeric' }, help);

  const canRider = access ? access.permissions.includes('promo.write') : false;
  const canDriver = access ? access.permissions.includes('incentive.write') : false;

  return (
    <>
      <section className="ops-form" aria-label="Campaign details">
        {text('pm-name', 'Name', 'name', err('name'))}
        {field('pm-about', 'About (optional, shown in the console only)', undefined, (
          <input id="pm-about" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} />
        ))}
        <div className="nf-grid">
          {field('pm-scope', 'Where it runs', err('scope'), (
            <select id="pm-scope" className="ops-select" value={form.scope} disabled={editingExisting}
              aria-invalid={err('scope') ? true : undefined} onChange={(e) => set('scope', e.target.value)}>
              <option value="">Choose a place</option>
              {places.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.kind})</option>)}
            </select>
          ), places.length === 0 && options ? 'No place in your scope can run this kind.' : undefined)}
          {kind === 'referral' ? field('pm-audience', 'Who is referred', undefined, (
            <select id="pm-audience" className="ops-select" value={form.audience} disabled={editingExisting}
              onChange={(e) => set('audience', e.target.value as Audience)}>
              {canRider ? <option value="rider">Riders</option> : null}
              {canDriver ? <option value="driver">Drivers</option> : null}
            </select>
          )) : null}
        </div>
        <div className="nf-grid">
          {text('pm-starts', 'Starts', 'startsAt', err('startsAt'), { type: 'datetime-local' })}
          {text('pm-ends', 'Ends', 'endsAt', err('endsAt'), { type: 'datetime-local' })}
        </div>
      </section>

      {kind === 'rider_promo' ? (
        <section className="ops-form" aria-label="The discount">
          <h3 className="ops-subhead">The discount</h3>
          <p className="help m-0">Paid by the platform. The rider pays the fare less the discount; the driver&apos;s earnings and commission stay on the full fare. A ride never goes below a minimum charge.</p>
          <div className="nf-grid">
            {text('pm-code', 'Code', 'code', err('code'), { autoCapitalize: 'characters', disabled: form.autoApply },
              'Letters, digits, dashes. The rider types it on the fare screen.')}
            <div className="nf-field">
              <span className="ops-form__label" id="pm-auto-l">Applied automatically</span>
              <label className="lo-check" htmlFor="pm-auto">
                <input id="pm-auto" type="checkbox" checked={form.autoApply} aria-labelledby="pm-auto-l"
                  onChange={(e) => set('autoApply', e.target.checked)} />
                No code: the best live promo applies at booking
              </label>
            </div>
          </div>
          <div className="nf-grid">
            {field('pm-dtype', 'Type', undefined, (
              <select id="pm-dtype" className="ops-select" value={form.discountType}
                onChange={(e) => set('discountType', e.target.value as 'flat' | 'percent')}>
                <option value="flat">Flat amount off</option>
                <option value="percent">Percentage off</option>
              </select>
            ))}
            {form.discountType === 'flat'
              ? money('pm-flat', 'Amount off', 'discountFlat', err('discountFlat'))
              : text('pm-pct', 'Percent off', 'discountPercent', err('discountPercent'), { inputMode: 'decimal', placeholder: '10' })}
          </div>
          {form.discountType === 'percent' ? (
            <div className="nf-grid">
              {money('pm-maxd', 'Most it may take off', 'maxDiscount', err('maxDiscount'), 'Leave empty for no limit.')}
              {money('pm-typical', 'Typical fare (for the projection only)', 'typicalFare', undefined,
                'Used to price the discount below. Not sent.')}
            </div>
          ) : null}
          <div className="nf-grid">
            {money('pm-minfare', 'Minimum fare', 'minFare', err('minFare'), 'Leave empty for none.')}
            {whole('pm-peruser', 'Uses per rider', 'maxPerUser', err('maxPerUser'))}
          </div>
          <div className="nf-grid">
            {whole('pm-maxtotal', 'Most redemptions overall', 'maxTotal', err('maxTotal'), 'Leave empty for the budget alone to decide.')}
            {field('pm-zone', 'Only in one zone (optional)', undefined, (
              <select id="pm-zone" className="ops-select" value={form.zoneCode} onChange={(e) => set('zoneCode', e.target.value)}>
                <option value="">Everywhere in the place</option>
                {zones.map((z) => <option key={z.code} value={z.code}>{z.name}</option>)}
              </select>
            ))}
          </div>
          <label className="lo-check">
            <input type="checkbox" checked={form.newRidersOnly} onChange={(e) => set('newRidersOnly', e.target.checked)} />
            New riders only (no completed trip yet)
          </label>
        </section>
      ) : null}

      {kind === 'driver_incentive' ? (
        <section className="ops-form" aria-label="The quest">
          <h3 className="ops-subhead">The quest</h3>
          <p className="help m-0">Paid in the weekly payout as its own line, with no commission. Tax is not configured yet, so none is computed or withheld. A reward is reserved when the driver completes the trips; when the budget is used up, no further reward is paid.</p>
          <div className="nf-grid">
            {whole('pm-target', 'Trips to complete', 'targetTrips', err('targetTrips'))}
            {money('pm-reward', 'Reward', 'reward', err('reward'))}
          </div>
          <div className="nf-grid">
            {field('pm-izone', 'Only pickups in one zone (optional)', undefined, (
              <select id="pm-izone" className="ops-select" value={form.zoneCode} onChange={(e) => set('zoneCode', e.target.value)}>
                <option value="">Any zone in the place</option>
                {zones.map((z) => <option key={z.code} value={z.code}>{z.name}</option>)}
              </select>
            ))}
            {field('pm-vclass', 'Only one vehicle class (optional)', undefined, (
              <select id="pm-vclass" className="ops-select" value={form.vehicleType} onChange={(e) => set('vehicleType', e.target.value)}>
                <option value="">Any class</option>
                {(options?.vehicle_types ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ))}
          </div>
          <div className="nf-grid">
            {whole('pm-hfrom', 'From hour (0 to 23, optional)', 'hourFrom', err('hourFrom'), 'The hour the trip ends, in the place’s time.')}
            {whole('pm-hto', 'To hour (0 to 24)', 'hourTo', err('hourTo'), 'A window may wrap midnight: 22 to 6.')}
          </div>
        </section>
      ) : null}

      {kind === 'referral' ? (
        <section className="ops-form" aria-label="The referral">
          <h3 className="ops-subhead">The referral</h3>
          <p className="help m-0">A reward is earned only after the new person completes the trips below, and never across the same device, phone number or payment instrument; a blocked reward goes to the fraud queue. A rider&apos;s reward is a wallet credit; a driver&apos;s is paid in the weekly payout with no commission.</p>
          <div className="nf-grid">
            {whole('pm-req', 'Trips the new person must complete', 'requiredTrips', err('requiredTrips'))}
          </div>
          <div className="nf-grid">
            {money('pm-rr', 'Reward for the referrer', 'referrerReward', err('referrerReward'), 'Leave empty for none.')}
            {money('pm-re', 'Reward for the new person', 'refereeReward', err('refereeReward'), 'Leave empty for none.')}
          </div>
        </section>
      ) : null}

      <section className="ops-form" aria-label="Budget">
        <h3 className="ops-subhead">Budget</h3>
        <div className="nf-grid">
          {money('pm-budget', 'Budget', 'budget', err('budget'), 'A hard cap: the campaign stops when it is used up.')}
        </div>
        <label className="lo-check">
          <input type="checkbox" checked={form.strictCap} onChange={(e) => set('strictCap', e.target.checked)} />
          Hard cap: refuse any application that does not fit in what is left
        </label>
        {!form.strictCap ? (
          <p className="help m-0">Without it the last application may cross the cap by less than one discount. Trips that already hold a discount are always honoured, and an overshoot alerts Finance.</p>
        ) : null}
        <div className="nf-funnel pm-cost" aria-live="polite" aria-label="Cost projection">
          <b>What this commits the platform to</b>
          <ul>
            <li>Budget: <b>{cost.budgetMinor !== null ? formatMinor(cost.budgetMinor, currency) : '—'}</b></li>
            <li>Average per {kind === 'rider_promo' ? 'discount' : kind === 'driver_incentive' ? 'reward' : 'referral'}: <b>{cost.averageMinor !== null ? formatMinor(cost.averageMinor, currency) : '—'}</b></li>
            <li>Most it can fund: <b>{cost.maxRedemptions !== null ? cost.maxRedemptions : '—'}</b></li>
          </ul>
          {words ? <p className="m-0">{words}</p> : cost.hint ? <p className="help m-0">{cost.hint}</p> : (
            <p className="help m-0">Fill in the amounts to see what the budget buys.</p>
          )}
        </div>
      </section>

      <section className="ops-form" aria-label="Reason">
        <label className="ops-form__label" htmlFor="pm-why">Why (kept in the audit log; needed to submit)</label>
        <textarea id="pm-why" className="input" rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} />
        <p className="help m-0">Going live needs a second admin to approve exactly what you see here.</p>
      </section>
    </>
  );
}

