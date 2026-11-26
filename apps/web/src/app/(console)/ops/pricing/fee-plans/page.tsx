'use client';

import { marketDate } from '@/lib/consoleTime';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { canDraftPricing } from '@/lib/pricing';
import { classWord, placeWord } from '@/lib/pricingWords';
import { ResolvedPlans } from '@/components/console/pricing/ResolvedPlans';
import { RegulationPanel } from '@/components/console/pricing/RegulationPanel';
import { PricingNav } from '@/components/console/pricing';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { DataTable, Drawer, ErrorState, Skeleton } from '@/components/console/ui';
import { plural } from '@/lib/plural';
import { FeePlanEditDrawer, FeePlanPanel, type FeePlan } from '@/components/console/pricing/FeePlanEdit';

/**
 * Pricing > Driver fee plans (9 Nov). One active plan per market, resolved city -> state ->
 * country. `percent_commission` is today's commission; the others charge one platform fee per
 * driver and local day (floor, per-trip fee, cap, waiver), never more than the legal share of a
 * trip. A plan is drafted here and activated by a second admin; it starts the next local day.
 * The simulator compares plan types and never activates anything.
 */
type Plan = FeePlan;
type SimRow = {
  plan: string; preset: string; trips_per_day: number; fares_per_day_minor: number; driver_pays_day_minor: number;
  driver_pays_month_minor: number; driver_share_percent: number | null; our_cost_day_minor: number;
  driver_takes_home_day_minor?: number;
  we_keep_day_minor: number; loses_money: boolean; breaks_legal_share: boolean;
};
type Sim = { average_fare_minor: number; average_fare_source: string; cost_per_trip_minor: number; currency: string;
  rows: SimRow[]; cost_breakdown: { missing: string[] } };

const STATUS_WORDS: Record<string, string> = { draft: 'Draft', pending_approval: 'Waiting for approval', active: 'In force', archived: 'Ended' };
const TONE: Record<string, ChipTone> = { draft: 'neutral', pending_approval: 'info', active: 'good', archived: 'neutral' };
// 22 Nov (Srini's ruling): three plan types -- a daily fee, a commission, a per-trip fee.
const TYPE_WORDS: Record<string, string> = {
  daily_pass: 'Daily fee', percent_commission: 'Commission (% of each fare)', fair_share: 'Per-trip fee (Fair Share)',
  per_trip_fee: 'Per-trip fee',
};
const rupees = (minor: number | null | undefined, cur = 'INR') =>
  minor == null ? '—' : `${cur === 'INR' ? '₹' : '$'}${(minor / 100).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })}`;
const toMinor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100));

function amountsWords(p: Plan) {
  return Object.entries(p.amounts).map(([cls, a]) => {
    const bits = [
      a.per_trip_fee_minor != null ? `${rupees(a.per_trip_fee_minor, p.currency)} a trip` : null,
      a.daily_pass_minor != null ? `${rupees(a.daily_pass_minor, p.currency)} a day` : null,
      a.fee_free_after_trips != null ? `free after ${a.fee_free_after_trips}` : null,
      a.commission_percent != null ? `${a.commission_percent}%` : null,
    ].filter(Boolean);
    return `${classWord(cls)}: ${bits.join(', ') || 'to be decided'}`;
  });
}

/** 24 Nov (owner): the rider booking fee once per place, not repeated in every class cell. */
function riderFeeWords(p: Plan): string {
  const fees = Object.entries(p.amounts).map(([cls, a]) => [cls, a.rider_platform_fee_minor] as const).filter(([, f]) => f != null);
  if (!fees.length) return 'None';
  const one = new Set(fees.map(([, f]) => f));
  if (one.size === 1) return rupees(fees[0][1], p.currency);
  return fees.map(([cls, f]) => `${classWord(cls)} ${rupees(f, p.currency)}`).join(', ');
}

/** Classes whose driver fee an ACTIVE plan leaves undecided: an open decision for the owner. */
function undecided(plans: Plan[]): { where: string; classes: string[] }[] {
  return plans.filter((p) => p.status === 'active').map((p) => ({
    where: p.scope_code,
    classes: Object.entries(p.amounts).filter(([, a]) => Object.values(a).every((v) => v == null)).map(([c]) => classWord(c)),
  })).filter((x) => x.classes.length > 0);
}

export default function FeePlansPage() {
  const access = useAdminAccess();
  const may = canDraftPricing(access);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [opened, setOpened] = useState<Plan | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [discarding, setDiscarding] = useState<Plan | null>(null);
  const versionsOf = (p: Plan) => (plans ?? []).filter((x) => x.country === p.country && x.scope_code === p.scope_code);
  // 25 Nov (owner): the table shows what is in force and what is moving; ended versions live in the history.
  const current = (plans ?? []).filter((p) => p.status !== 'archived');
  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans((await api.get<{ results: Plan[] }>('/pricing/admin/fee-plans/')).results);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The fee plans could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function withdraw(p: Plan) {
    if (!p.approval_request_id) return;
    try {
      await api.post(`/approvals/admin/requests/${p.approval_request_id}/cancel/`, { reason: 'Withdrawn by the editor' });
      setNotice('Withdrawn. The plan in force is unchanged; the change is back as a draft you can edit.');
      setOpened(null);
      void load();
    } catch (err) {
      setNotice(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    }
  }



  return (
    <>
      <PricingNav />
      <header className="ops-list__head mb-3">
        <div>
          <h1>Driver fee plans</h1>
          <p>The only way drivers are charged: a daily fee, a commission (% of each fare) or a per-trip fee, per place. A place cannot go live, and riders are offered no class, until a plan is approved. A change starts the next local day and never reaches a trip already booked.</p>
        </div>
        {/* 25 Nov (owner): "New draft…" only for a new place or class; a change is Edit on its row. */}
        {may ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setDrafting(true)}>New place or class…</button> : null}
      </header>
      {notice ? <div className="ops-confirm mb-3" role="status"><b>{notice}</b></div> : null}
      {plans && undecided(plans).length ? (
        <div className="ops-note ops-note--warn mb-3" role="status">
          <b>Open decision for Srini:</b>{' '}
          {undecided(plans).map((u) => `the driver fee for ${u.classes.join(' and ')} in ${placeWord(u.where, access)}`).join('; ')}.
          {' '}Riders are not offered a class until its driver fee is approved.
        </div>
      ) : null}
      {error ? <ErrorState title="The fee plans could not be loaded" detail={error} onRetry={() => void load()} />
        : plans === null ? <Skeleton kind="row" count={4} /> : (
          <DataTable caption="Driver fee plans" wrap rows={current} rowKey={(p) => p.id} maxHeight={false}
            columns={[
              { key: 'where', label: 'Where', render: (p) => (p.scope_code ? p.scope_name ?? placeWord(p.scope_code, access) : `All of ${p.scope_name ?? placeWord(p.country, access)}`) },
              { key: 'type', label: 'Plan', render: (p) => TYPE_WORDS[p.plan_type] ?? p.plan_type },
              { key: 'version', label: 'Version', render: (p) => `v${p.version}` },
              { key: 'status', label: 'Status', render: (p) => <StatusChip tone={TONE[p.status] ?? 'neutral'}>{STATUS_WORDS[p.status] ?? p.status.replace('_', ' ')}</StatusChip> },
              { key: 'amounts', label: 'Driver fee per class', render: (p) => <ul className="ops-list-plain">{amountsWords(p).map((w) => <li key={w}>{w}</li>)}</ul> },
              { key: 'rider', label: 'Rider booking fee', render: (p) => riderFeeWords(p) },
              { key: 'rules', label: 'Floor · cap · waiver', render: (p) => `${rupees(p.earnings_floor_minor, p.currency)} · ${p.daily_cap_minor == null ? 'no cap' : rupees(p.daily_cap_minor, p.currency)} · ${p.waiver_first_days ? `first ${plural(p.waiver_first_days, 'day')} free` : p.waiver_until ? `free until ${marketDate(p.waiver_until, p.country)}` : 'none'}` },
              { key: 'from', label: 'From', render: (p) => (p.effective_from ? `${marketDate(p.effective_from, p.country)}${p.effective_to ? ` to ${marketDate(p.effective_to, p.country)}` : ''}` : '—') },
              { key: 'act', label: 'Actions', render: (p) => (
                <span className="ops-row-actions">
                  {may && (p.status === 'active' || p.status === 'draft')
                    ? <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(p)}
                      aria-label={`Edit the plan for ${p.scope_name ?? p.scope_code ?? p.country}`}>Edit</button> : null}
                  {may && p.status === 'draft'
                    ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setDiscarding(p)}
                      aria-label={`Discard the draft for ${p.scope_name ?? p.scope_code ?? p.country}`}>Discard draft…</button> : null}
                  {may && p.status === 'pending_approval'
                    ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void withdraw(p)}>Withdraw</button> : null}
                  <button type="button" className="ops-linkbtn" onClick={() => setOpened(p)}
                    aria-label={`History of the plan for ${p.scope_name ?? p.scope_code ?? p.country}`}>History</button>
                </span>) },
            ]} />
        )}
      <div className="mt-4"><ResolvedPlans /></div>
      <div className="mt-4"><Simulator /></div>
      {/* 24 Nov (owner): the legal caps live with the plans they limit (commission is a plan type). */}
      <div className="mt-4"><RegulationPanel may={may} /></div>
      {opened ? <FeePlanPanel plan={opened} versions={versionsOf(opened)} may={may} onClose={() => setOpened(null)}
        onEdit={() => { setEditing(opened); setOpened(null); }} onWithdraw={() => void withdraw(opened)} /> : null}
      {discarding ? <DiscardDrawer plan={discarding} onClose={() => setDiscarding(null)}
        onDone={(t) => { setDiscarding(null); setNotice(t); void load(); }} /> : null}
      {editing ? <FeePlanEditDrawer plan={editing} onClose={() => setEditing(null)}
        onDone={(t) => { setEditing(null); setNotice(t); void load(); }} /> : null}
      {drafting ? <DraftDrawer onClose={() => setDrafting(false)} onDone={(t) => { setDrafting(false); setNotice(t); void load(); }} /> : null}
    </>
  );
}

function DraftDrawer({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [f, setF] = useState({ country: 'IN', scope_code: '', plan_type: 'fair_share', classes: 'hatchback, sedan, suv',
    per_trip: '10', pass: '', free_after: '', commission: '', rider_fee: '', floor: '1000', cap: '149',
    waiver_days: '60', note: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const sym = f.country.trim().toUpperCase() === 'US' ? '$' : '₹';
  const field = (k: keyof typeof f, label: string) => (
    <><label className="ops-form__label" htmlFor={`fp-${k}`}>{label}</label>
      <input id={`fp-${k}`} className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} /></>
  );
  async function save() {
    setBusy(true); setError(null);
    const per = { per_trip_fee_minor: toMinor(f.per_trip), daily_pass_minor: toMinor(f.pass),
      fee_free_after_trips: f.free_after.trim() ? Number(f.free_after) : null,
      commission_percent: f.commission.trim() ? Number(f.commission) : null, rider_platform_fee_minor: toMinor(f.rider_fee) };
    const amounts = Object.fromEntries(f.classes.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
      .map((c) => [c, Object.fromEntries(Object.entries(per).filter(([, v]) => v != null))]));
    try {
      await api.post('/pricing/admin/fee-plans/', {
        country: f.country, scope_code: f.scope_code.trim().toUpperCase(), plan_type: f.plan_type, amounts,
        earnings_floor_minor: toMinor(f.floor) ?? 0, daily_cap_minor: toMinor(f.cap),
        waiver_first_days: f.waiver_days.trim() ? Number(f.waiver_days) : null, note: f.note, reason: f.reason });
      onDone('Draft saved. Send it for approval when it is ready.');
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open title="New driver fee plan (draft)" onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void save()} disabled={busy || f.reason.trim().length < 5}>{busy ? 'Working…' : 'Save draft'}</button>
      </>}>
      <div className="ops-form">
        {/* Money labels follow the plan's country (a US plan is in dollars). */}
        <label className="ops-form__label" htmlFor="fp-type">Plan type</label>
        <select id="fp-type" className="input" value={f.plan_type} onChange={(e) => set('plan_type', e.target.value)}>
          {Object.entries(TYPE_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {field('country', 'Country (IN, US)')}
        {field('scope_code', 'State or city code (blank = the whole country), e.g. IN-TG or IN-TG-HYD')}
        {field('classes', 'Classes, comma separated: auto, hatchback (Mini), sedan, suv, standard, xl; * = all')}
        {field('per_trip', `Fee per trip (${sym})`)}
        {field('pass', `Daily fee (${sym}, charged only on a day with a trip)`)}
        {field('free_after', 'Fee-free after this many trips a day (optional)')}
        {field('commission', 'Commission % (commission plans)')}
        {field('floor', `Earnings floor a day (${sym}, 0 = off)`)}
        {field('cap', `Daily cap (${sym}, blank = none)`)}
        {field('waiver_days', 'Launch waiver: first N days from a driver’s first trip')}
        {field('rider_fee', `Rider platform fee (${sym}; only used while its flag is on)`)}
        {field('note', 'Note')}
        {field('reason', 'Why (kept in the audit log)')}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

function Simulator() {
  const [f, setF] = useState({ country: 'IN', vehicle_type: 'sedan', fare: '', commission: '10', pass: '49' });
  const [sim, setSim] = useState<Sim | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setError(null);
    try {
      setSim(await api.post<Sim>('/pricing/admin/fee-plans/simulate/', {
        country: f.country, vehicle_type: f.vehicle_type, average_fare_minor: toMinor(f.fare),
        commission_percent: Number(f.commission), daily_pass_minor: toMinor(f.pass) }));
    } catch (err) {
      setSim(null);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The simulator could not run.');
    }
  }
  const input = (k: keyof typeof f, label: string) => (
    <label className="grid gap-1"><span className="help">{label}</span>
      <input className="input" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} /></label>
  );
  const cur = sim?.currency ?? 'INR';
  return (
    <section className="ops-card" aria-labelledby="fp-sim">
      <header className="ops-card__head"><div><h2 id="fp-sim">Simulator</h2>
        <p>Compares plan types at Basic (5), Medium (12) and Heavy (20) trips a day. It never activates anything.</p></div></header>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="grid gap-1"><span className="help">Market</span>
          <select className="input" value={f.country} onChange={(e) => {
            // 23 Nov review: a market by name, and its own classes and default daily fee.
            const country = e.target.value;
            setF((x) => ({ ...x, country, vehicle_type: country === 'US' ? 'standard' : 'sedan', pass: country === 'US' ? '5' : '49' }));
          }}>
            <option value="IN">India</option><option value="US">United States</option>
          </select></label>
        <label className="grid gap-1"><span className="help">Class</span>
          <select className="input" value={f.vehicle_type} onChange={(e) => setF((x) => ({ ...x, vehicle_type: e.target.value }))}>
            {(f.country === 'US' ? ['standard', 'xl'] : ['auto', 'hatchback', 'sedan', 'suv']).map((c) => <option key={c} value={c}>{classWord(c)}</option>)}
          </select></label>
        {input('fare', `Average fare (${f.country === 'US' ? '$' : '₹'}, blank = last 30 days)`)}
        {input('commission', 'Commission % to compare')}{input('pass', `Daily fee (${f.country === 'US' ? '$' : '₹'}) to compare`)}
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void run()}>Run</button>
      </div>
      {error ? <div className="alert-error mt-3" role="alert">{error}</div> : null}
      {sim ? (
        <div className="mt-3">
          <p className="help m-0">Average fare {rupees(sim.average_fare_minor, cur)} ({sim.average_fare_source.replace(/_/g, ' ')}) · our variable cost {rupees(sim.cost_per_trip_minor, cur)} a trip
            {sim.cost_breakdown.missing.length ? ' (an estimate: SMS and call prices are not set yet)' : ''}</p>
          <DataTable caption="Simulated plans" rows={sim.rows} rowKey={(r) => `${r.plan}-${r.preset}`} density="compact" maxHeight={false}
            columns={[
              { key: 'plan', label: 'Plan', render: (r) => TYPE_WORDS[r.plan] ?? r.plan },
              { key: 'preset', label: 'Day', render: (r) => `${r.preset} (${r.trips_per_day} ${r.trips_per_day === 1 ? 'trip' : 'trips'})` },
              { key: 'pays', label: 'Driver pays a day', num: true, render: (r) => rupees(r.driver_pays_day_minor, cur) },
              { key: 'home', label: 'Driver takes home', num: true, render: (r) => rupees(r.driver_takes_home_day_minor ?? (r.fares_per_day_minor - r.driver_pays_day_minor), cur) },
              { key: 'month', label: 'A month', num: true, render: (r) => rupees(r.driver_pays_month_minor, cur) },
              { key: 'share', label: 'Driver keeps', num: true, render: (r) => (r.driver_share_percent == null ? '—' : `${r.driver_share_percent}%`) },
              { key: 'cost', label: 'Our cost a day', num: true, render: (r) => rupees(r.our_cost_day_minor, cur) },
              { key: 'keep', label: 'SaaradhiGo keeps a day', num: true, render: (r) => (
                <span className={r.loses_money || r.breaks_legal_share ? 'ared' : undefined}>
                  {rupees(r.we_keep_day_minor, cur)}{r.loses_money ? ' · loses money' : ''}{r.breaks_legal_share ? ' · breaks the legal share' : ''}
                </span>) },
            ]} />
        </div>
      ) : null}
    </section>
  );
}

/** 26 Nov (owner): a draft nobody will send is discarded, with a reason; the plan in force is untouched. */
function DiscardDrawer({ plan, onClose, onDone }: { plan: Plan; onClose: () => void; onDone: (t: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true); setError(null);
    try {
      await api.post(`/pricing/admin/fee-plans/${plan.id}/discard/`, { reason: reason.trim() });
      onDone(`Draft v${plan.version} discarded. The plan in force is unchanged.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open title={`Discard draft v${plan.version} · ${plan.scope_name ?? plan.scope_code ?? plan.country}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()} disabled={busy || reason.trim().length < 5}>
          {busy ? 'Discarding…' : 'Discard draft'}</button>
      </>}>
      <div className="ops-form">
        <p className="help m-0">This draft was never in force. It leaves the list and stays in the history as discarded.</p>
        <label className="ops-form__label" htmlFor="fd-discard-why">Why (kept in the audit log)</label>
        <textarea id="fd-discard-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
