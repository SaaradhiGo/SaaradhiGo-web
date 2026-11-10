'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { formatMinor } from '@/lib/finance';
import { newIdempotencyKey } from '@/lib/trips';
import { DataTable, Pill } from '@/components/console/ui';
import { FieldsDrawer, toText, type FieldSpec } from '@/components/console/kit/FieldsDrawer';

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
};
export type Scope = {
  scope: string; kind: 'state' | 'city'; name: string; parent: string | null;
  override: (CycleFields & { version: number }) | null;
  effective: CycleFields & { sources: Record<string, string> };
  next_payout_date: string | null; preview: string | null;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function cycleWords(c: CycleFields): string {
  const at = c.payout_time_local ? ` at ${c.payout_time_local}` : '';
  if (c.payout_schedule === 'weekly') return `Weekly on ${DAYS[c.payout_weekday ?? 0]}${at}`;
  if (c.payout_schedule === 'every_n_days') return `Every ${c.payout_interval_days} days from ${c.payout_anchor_date}${at}`;
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
  return `On · provider fee ${parts.join(' ') || 'not entered'}${by} · SaaradhiGo fee 0`;
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
];

export function PayoutScopes({ country, currency, scopes, may, onDone }: {
  country: string; currency: string; scopes: Scope[]; may: boolean;
  onDone: (text: string, kind: 'pending' | 'done') => void;
}) {
  const [editing, setEditing] = useState<Scope | null>(null);
  const [key] = useState(newIdempotencyKey);
  if (scopes.length === 0) return null;
  const own = (s: Scope) => Object.entries(s.effective.sources).filter(([, src]) => src === s.scope).map(([k]) => k);

  return (
    <div className="mt-4">
      <DataTable caption={`States and cities in ${country}`} rows={scopes} rowKey={(s) => s.scope} density="compact" maxHeight={false}
        columns={[
          { key: 'name', label: 'Place', render: (s) => (
            <span className={s.kind === 'city' ? 'ops-tree ops-tree--1' : ''}>{s.name}{s.override ? <> <Pill tone="wait">own settings</Pill></> : null}</span>
          ) },
          { key: 'cycle', label: 'Paid', render: (s) => cycleWords(s.effective) },
          { key: 'min', label: 'Minimum', num: true, render: (s) => (s.effective.minimum_withdrawal_minor != null ? formatMinor(s.effective.minimum_withdrawal_minor, currency) : '—') },
          { key: 'instant', label: 'Withdraw now', render: (s) => instantWords(s.effective, currency) },
          { key: 'inherits', label: 'Set here', hideBelow: 1100, render: (s) => (own(s).length ? own(s).join(', ').replace(/_/g, ' ') : `All from ${s.parent ?? country}`) },
          { key: 'next', label: 'Next payout', render: (s) => s.preview ?? '—' },
          { key: 'edit', label: '', render: (s) => (may ? <button type="button" className="ops-linkbtn" onClick={() => setEditing(s)}>Change…</button> : null) },
        ]} />
      {editing ? (
        <FieldsDrawer title={`Payouts · ${editing.name}`} fields={FIELDS}
          initial={Object.fromEntries(FIELDS.map((f) => [f.key, toText((editing.override as Record<string, unknown> | null)?.[f.key])]))}
          note={`Blank means "not set here": ${editing.name} then uses ${editing.parent ?? country}'s value.`}
          send={(changes, reason) => api.post(`/payments/admin/payout-config/${country}/`,
            { scope: editing.scope, ...changes, reason, idempotency_key: `${key}-${editing.scope}` })}
          onClose={() => setEditing(null)}
          onDone={(text, kind) => { setEditing(null); onDone(text, kind); }} />
      ) : null}
    </div>
  );
}
