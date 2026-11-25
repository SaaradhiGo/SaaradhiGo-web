'use client';

import { hiddenPlace } from '@/lib/notLaunched';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMinor } from '@/lib/finance';
import { marketDate } from '@/lib/consoleTime';
import { newIdempotencyKey } from '@/lib/trips';
import { DataTable, Pill } from '@/components/console/ui';
import { FieldsDrawer, toText, type FieldSpec } from '@/components/console/kit/FieldsDrawer';
import { plural } from '@/lib/plural';

/**
 * Payouts by state and city (owner ruling, 9 Nov): each place's settings with what it sets
 * itself and what it takes from the level above, and when its drivers are next paid. A change
 * is the same request as the country's, approved by a second finance admin.
 */
export type CycleFields = {
  payout_schedule?: string | null; payout_weekday?: number | null; payout_interval_days?: number | null;
  payout_anchor_date?: string | null; payout_time_local?: string | null; minimum_withdrawal_minor?: number | null;
  instant_cashout_enabled?: boolean | null; instant_fee_provider?: string | null; instant_fee_percent?: string | null;
  instant_cashout_fee_flat_minor?: number | null; instant_fee_min_minor?: number | null; instant_fee_max_minor?: number | null;
  instant_fee_tiers?: Array<[number | null, number]> | null;
  instant_max_per_day?: number | null; instant_max_amount_per_day_minor?: number | null;
};
export type Scope = {
  scope: string; kind: 'state' | 'city'; name: string; parent: string | null;
  override: (CycleFields & { version: number }) | null;
  effective: CycleFields & { sources: Record<string, string> };
  next_payout_date: string | null; preview: string | null;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function cycleWords(c: CycleFields, country = 'IN'): string {
  const at = c.payout_time_local ? ` at ${c.payout_time_local}` : '';
  if (c.payout_schedule === 'weekly') return `Weekly on ${DAYS[c.payout_weekday ?? 0]}${at}`;
  if (c.payout_schedule === 'every_n_days') return `${c.payout_interval_days === 1 ? 'Every day' : `Every ${c.payout_interval_days} days`} from ${marketDate(c.payout_anchor_date, country)}${at}`;
  return 'On request';
}

export function instantWords(c: CycleFields, currency: string): string {
  if (!c.instant_cashout_enabled) return 'Off';
  const parts: string[] = [];
  if (c.instant_fee_tiers?.length) {
    parts.push(c.instant_fee_tiers.map(([upTo, fee]) => `${formatMinor(fee, currency)}${upTo === null ? ' above' : ` up to ${formatMinor(upTo, currency)}`}`).join(', '));
  }
  if (c.instant_fee_percent) parts.push(`${Number(c.instant_fee_percent)}%`);
  if (c.instant_cashout_fee_flat_minor) parts.push(`+ ${formatMinor(c.instant_cashout_fee_flat_minor, currency)}`);
  const by = c.instant_fee_provider ? ` (charged by ${c.instant_fee_provider})` : '';
  return `On · provider fee ${parts.join(' ') || 'not entered'}${by} · SaaradhiGo fee 0 · ${limitWords(c, currency)}`;
}

/** The daily Withdraw now limit (10 Nov), over the driver's local day. */
export function limitWords(c: CycleFields, currency: string): string {
  const parts: string[] = [];
  if (c.instant_max_per_day != null) parts.push(`${c.instant_max_per_day} a day`);
  if (c.instant_max_amount_per_day_minor != null) parts.push(`${formatMinor(c.instant_max_amount_per_day_minor, currency)} a day`);
  return parts.length ? `at most ${parts.join(' and ')}` : 'no daily limit';
}

const FIELDS: FieldSpec[] = [
  { key: 'payout_schedule', label: 'Payout schedule', kind: 'select', options: [
    { value: 'every_n_days', label: 'Every N days' }, { value: 'weekly', label: 'Weekly' },
    { value: 'on_request', label: 'On request (the driver asks)' }] },
  { key: 'payout_interval_days', label: 'Every how many days (1 to 14)', kind: 'number' },
  { key: 'payout_anchor_date', label: 'Counting from', kind: 'date' },
  { key: 'payout_weekday', label: 'Weekday (weekly)', kind: 'select',
    options: DAYS.map((d, i) => ({ value: String(i), label: d })) },
  { key: 'payout_time_local', label: 'Payout time (local)', kind: 'time' },
  { key: 'minimum_withdrawal_minor', label: 'Minimum payout (minor units, 10000 = ₹100)', kind: 'number' },
  { key: 'instant_cashout_enabled', label: 'Withdraw now is on', kind: 'bool' },
  { key: 'instant_fee_provider', label: 'Provider (shown as "charged by …")', kind: 'text' },
  { key: 'instant_fee_percent', label: 'Provider fee (% of the amount)', kind: 'number' },
  { key: 'instant_cashout_fee_flat_minor', label: 'Provider fee, fixed part (minor units)', kind: 'number' },
  { key: 'instant_fee_min_minor', label: 'Provider fee, at least (minor units)', kind: 'number' },
  { key: 'instant_fee_max_minor', label: 'Provider fee, at most (minor units)', kind: 'number' },
  { key: 'instant_max_per_day', label: 'Withdraw now, at most this many a day', kind: 'number' },
  { key: 'instant_max_amount_per_day_minor', label: 'Withdraw now, at most this total a day (minor units)', kind: 'number' },
];

/** The fields a place can set, in words, for "what differs". */
const SHORT: Record<string, string> = {
  payout_schedule: 'Paid', payout_interval_days: 'Paid', payout_anchor_date: 'Paid', payout_weekday: 'Paid',
  payout_time_local: 'Paid', minimum_withdrawal_minor: 'Minimum payout',
  instant_cashout_enabled: 'Withdraw now', instant_fee_provider: 'Withdraw now', instant_fee_percent: 'Withdraw now',
  instant_cashout_fee_flat_minor: 'Withdraw now', instant_fee_min_minor: 'Withdraw now', instant_fee_max_minor: 'Withdraw now',
  instant_fee_tiers: 'Withdraw now', instant_max_per_day: 'Withdraw now limit', instant_max_amount_per_day_minor: 'Withdraw now limit',
};

function valueOf(label: string, c: CycleFields, country: string, currency: string): string {
  if (label === 'Paid') return cycleWords(c, country);
  if (label === 'Minimum payout') return c.minimum_withdrawal_minor != null ? formatMinor(c.minimum_withdrawal_minor, currency) : '—';
  if (label === 'Withdraw now limit') return limitWords(c, currency);
  return c.instant_cashout_enabled ? 'On' : 'Off';
}

/**
 * Payouts by state and city (owner ruling, 9 Nov; layout 22 Nov). The country's settings are shown
 * once above. Here: one line naming every place that is "Same as {country}", then only the places
 * that set something themselves, each difference against the country's value. A change is the same
 * request as the country's, approved by a second finance admin.
 */
export function PayoutScopes({ country, countryName, currency, base, scopes: all, may, onDone }: {
  country: string; countryName?: string; currency: string; base?: CycleFields | null; scopes: Scope[]; may: boolean;
  onDone: (text: string, kind: 'pending' | 'done') => void;
}) {
  const [editing, setEditing] = useState<Scope | null>(null);
  const [pick, setPick] = useState('');
  const [key] = useState(newIdempotencyKey);
  // 24 Nov (owner): not-launched places stay out unless "Show not launched" is on.
  const scopes = all.filter((s) => !hiddenPlace(s.scope));
  if (scopes.length === 0) return null;
  const name = countryName ?? country;
  const own = (s: Scope) => Object.entries(s.effective.sources).filter(([, src]) => src === s.scope).map(([k]) => k);
  const differs = scopes.filter((s) => own(s).length > 0);
  const same = scopes.filter((s) => own(s).length === 0);
  const diffOf = (s: Scope) => Array.from(new Set(own(s).map((k) => SHORT[k] ?? k)));

  return (
    <div className="mt-4 ps-scopes">
      <h3 className="ps-scopes__title">States and cities</h3>
      {same.length ? (
        <p className="ps-scopes__same">
          <b>Same as {name}</b> ({same.length}): {same.map((s) => s.name).join(', ')}.
        </p>
      ) : null}
      {differs.length ? (
        <DataTable caption={`Places in ${name} with their own payout settings`} rows={differs} rowKey={(s) => s.scope}
          density="compact" maxHeight={false}
          columns={[
            { key: 'name', label: 'Place', render: (s) => <span className="ops-nowrap">{s.name}</span> },
            { key: 'diff', label: `Differs from ${name}`, render: (s) => (
              <ul className="ps-diff">
                {diffOf(s).map((label) => (
                  <li key={label}>
                    <span className="ps-diff__label">{label}</span>{' '}
                    <mark className="ps-diff__new">{valueOf(label, s.effective, country, currency)}</mark>
                    {base ? <span className="muted"> instead of {valueOf(label, base, country, currency)}</span> : null}
                  </li>
                ))}
              </ul>
            ) },
            { key: 'next', label: 'Next payout', render: (s) => (s.next_payout_date ? marketDate(s.next_payout_date, country) : s.preview ?? '—') },
            { key: 'edit', label: '', render: (s) => (may ? <button type="button" className="ops-linkbtn" onClick={() => setEditing(s)}>Change…</button> : null) },
          ]} />
      ) : (
        <p className="help m-0">No state or city has its own payout settings: all use {name}&apos;s.</p>
      )}
      {may && same.length ? (
        <div className="ps-scopes__add">
          <label className="ops-form__label" htmlFor={`ps-pick-${country}`}>Give a place its own settings</label>
          <select id={`ps-pick-${country}`} className="ops-select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a state or city</option>
            {same.map((s) => <option key={s.scope} value={s.scope}>{s.name}</option>)}
          </select>
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={!pick}
            onClick={() => setEditing(same.find((s) => s.scope === pick) ?? null)}>Set…</button>
        </div>
      ) : null}
      {editing ? (
        <FieldsDrawer title={`Payouts · ${editing.name}`} fields={FIELDS}
          initial={Object.fromEntries(FIELDS.map((f) => [f.key, toText((editing.override as Record<string, unknown> | null)?.[f.key])]))}
          note={`Blank means "same as ${editing.parent ?? name}".`}
          send={(changes, reason) => api.post(`/payments/admin/payout-config/${country}/`,
            { scope: editing.scope, ...changes, reason, idempotency_key: `${key}-${editing.scope}` })}
          onClose={() => setEditing(null)}
          onDone={(text, kind) => { setEditing(null); onDone(text, kind); }} />
      ) : null}
    </div>
  );
}
