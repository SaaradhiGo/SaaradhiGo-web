'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { canDraftPricing } from '@/lib/pricing';
import { interpretWrite } from '@/lib/trips';
import { PricingNav } from '@/components/console/pricing';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { DataTable, Drawer, ErrorState, Skeleton } from '@/components/console/ui';

/**
 * Pricing > Driver fee plans (9 Nov). One active plan per market, resolved city -> state ->
 * country. `percent_commission` is today's commission; the others charge one platform fee per
 * driver and local day (floor, per-trip fee, cap, waiver), never more than the legal share of a
 * trip. A plan is drafted here and activated by a second admin; it starts the next local day.
 * The simulator compares plan types and never activates anything.
 */
type Plan = {
  id: number; country: string; scope_code: string; currency: string; plan_type: string;
  amounts: Record<string, Record<string, number>>; earnings_floor_minor: number; daily_cap_minor: number | null;
  waiver_until: string | null; waiver_first_days: number | null; status: string; version: number;
  effective_from: string | null; effective_to: string | null; note: string;
};
type SimRow = {
  plan: string; preset: string; trips_per_day: number; fares_per_day_minor: number; driver_pays_day_minor: number;
  driver_pays_month_minor: number; driver_share_percent: number | null; our_cost_day_minor: number;
  we_keep_day_minor: number; loses_money: boolean; breaks_legal_share: boolean;
};
type Sim = { average_fare_minor: number; average_fare_source: string; cost_per_trip_minor: number; currency: string;
  rows: SimRow[]; cost_breakdown: { missing: string[] } };

const TONE: Record<string, ChipTone> = { draft: 'neutral', pending_approval: 'info', active: 'good', archived: 'neutral' };
const TYPE_WORDS: Record<string, string> = {
  percent_commission: 'Commission %', per_trip_fee: 'Fee per trip', daily_pass: 'Daily pass', fair_share: 'Fair Share',
};
const rupees = (minor: number | null | undefined, cur = 'INR') =>
  minor == null ? '—' : `${cur === 'INR' ? '₹' : '$'}${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const toMinor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100));

function amountsWords(p: Plan) {
  return Object.entries(p.amounts).map(([cls, a]) => {
    const bits = [
      a.per_trip_fee_minor != null ? `${rupees(a.per_trip_fee_minor, p.currency)}/trip` : null,
      a.daily_pass_minor != null ? `${rupees(a.daily_pass_minor, p.currency)}/day` : null,
      a.fee_free_after_trips != null ? `free after ${a.fee_free_after_trips}` : null,
      a.commission_percent != null ? `${a.commission_percent}%` : null,
      a.rider_platform_fee_minor != null ? `rider ${rupees(a.rider_platform_fee_minor, p.currency)}` : null,
    ].filter(Boolean);
    return `${cls}: ${bits.join(', ') || 'to be decided'}`;
  }).join(' · ');
}

export default function FeePlansPage() {
  const access = useAdminAccess();
  const may = canDraftPricing(access);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans((await api.get<{ results: Plan[] }>('/pricing/admin/fee-plans/')).results);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The fee plans could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(p: Plan) {
    try {
      const body = await api.post(`/pricing/admin/fee-plans/${p.id}/submit/`, { reason: `Activate ${TYPE_WORDS[p.plan_type]} v${p.version}` });
      setNotice(interpretWrite(body as never, 'Plan activated.').message);
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
          <p>What drivers pay SaaradhiGo, per market. A change starts the next local day and never reaches a trip already booked.</p>
        </div>
        {may ? <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setDrafting(true)}>New draft…</button> : null}
      </header>
      {notice ? <div className="ops-confirm mb-3" role="status"><b>{notice}</b></div> : null}
      {error ? <ErrorState title="The fee plans could not be loaded" detail={error} onRetry={() => void load()} />
        : plans === null ? <Skeleton kind="row" count={4} /> : (
          <DataTable caption="Driver fee plans" rows={plans} rowKey={(p) => p.id} maxHeight={false}
            columns={[
              { key: 'where', label: 'Where', render: (p) => p.scope_code || `All of ${p.country}` },
              { key: 'type', label: 'Plan', render: (p) => `${TYPE_WORDS[p.plan_type] ?? p.plan_type} v${p.version}` },
              { key: 'status', label: 'Status', render: (p) => <StatusChip tone={TONE[p.status] ?? 'neutral'}>{p.status.replace('_', ' ')}</StatusChip> },
              { key: 'amounts', label: 'Per class', render: (p) => amountsWords(p) },
              { key: 'rules', label: 'Floor · cap · waiver', render: (p) => `${rupees(p.earnings_floor_minor, p.currency)} · ${p.daily_cap_minor == null ? 'no cap' : rupees(p.daily_cap_minor, p.currency)} · ${p.waiver_first_days ? `first ${p.waiver_first_days} days free` : p.waiver_until ? `free until ${p.waiver_until}` : 'none'}` },
              { key: 'from', label: 'From', render: (p) => (p.effective_from ? `${p.effective_from}${p.effective_to ? ` to ${p.effective_to}` : ''}` : '—') },
              { key: 'note', label: 'Note', hideBelow: 1280, render: (p) => p.note || '—' },
              { key: 'act', label: '', render: (p) => (may && p.status === 'draft'
                ? <button type="button" className="ops-linkbtn" onClick={() => void submit(p)}>Send for approval</button> : null) },
            ]} />
        )}
      <div className="mt-4"><Simulator /></div>
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
        <label className="ops-form__label" htmlFor="fp-type">Plan type</label>
        <select id="fp-type" className="input" value={f.plan_type} onChange={(e) => set('plan_type', e.target.value)}>
          {Object.entries(TYPE_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {field('country', 'Country (IN, US)')}
        {field('scope_code', 'State or city code (blank = the whole country), e.g. IN-TG or IN-TG-HYD')}
        {field('classes', 'Vehicle classes (comma separated)')}
        {field('per_trip', 'Fee per trip (₹)')}
        {field('pass', 'Daily pass (₹, daily pass plans)')}
        {field('free_after', 'Fee-free after this many trips a day (optional)')}
        {field('commission', 'Commission % (commission plans)')}
        {field('floor', 'Earnings floor a day (₹, 0 = off)')}
        {field('cap', 'Daily cap (₹, blank = none)')}
        {field('waiver_days', 'Launch waiver: first N days from a driver’s first trip')}
        {field('rider_fee', 'Rider platform fee (₹; only used while its flag is on)')}
        {field('note', 'Note')}
        {field('reason', 'Why (kept in the audit log)')}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

function Simulator() {
  const [f, setF] = useState({ country: 'IN', vehicle_type: 'sedan', fare: '', commission: '10', pass: '199' });
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
        {input('country', 'Market')}{input('vehicle_type', 'Class')}{input('fare', 'Average fare (₹, blank = last 30 days)')}
        {input('commission', 'Commission % to compare')}{input('pass', 'Daily pass (₹) to compare')}
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void run()}>Run</button>
      </div>
      {error ? <div className="alert-error mt-3" role="alert">{error}</div> : null}
      {sim ? (
        <div className="mt-3">
          <p className="help m-0">Average fare {rupees(sim.average_fare_minor, cur)} ({sim.average_fare_source.replace(/_/g, ' ')}) · our variable cost {rupees(sim.cost_per_trip_minor, cur)} a trip
            {sim.cost_breakdown.missing.length ? ` (not configured: ${sim.cost_breakdown.missing.join(', ')})` : ''}</p>
          <DataTable caption="Simulated plans" rows={sim.rows} rowKey={(r) => `${r.plan}-${r.preset}`} density="compact" maxHeight={false}
            columns={[
              { key: 'plan', label: 'Plan', render: (r) => TYPE_WORDS[r.plan] ?? r.plan },
              { key: 'preset', label: 'Day', render: (r) => `${r.preset} (${r.trips_per_day} trips)` },
              { key: 'pays', label: 'Driver pays a day', num: true, render: (r) => rupees(r.driver_pays_day_minor, cur) },
              { key: 'month', label: 'A month', num: true, render: (r) => rupees(r.driver_pays_month_minor, cur) },
              { key: 'share', label: 'Driver keeps', num: true, render: (r) => (r.driver_share_percent == null ? '—' : `${r.driver_share_percent}%`) },
              { key: 'cost', label: 'Our cost a day', num: true, render: (r) => rupees(r.our_cost_day_minor, cur) },
              { key: 'keep', label: 'We keep a day', num: true, render: (r) => (
                <span className={r.loses_money || r.breaks_legal_share ? 'ared' : undefined}>
                  {rupees(r.we_keep_day_minor, cur)}{r.loses_money ? ' · loses money' : ''}{r.breaks_legal_share ? ' · breaks the legal share' : ''}
                </span>) },
            ]} />
        </div>
      ) : null}
    </section>
  );
}
