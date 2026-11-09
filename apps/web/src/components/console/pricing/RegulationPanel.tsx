'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import { formatMinor } from '@/lib/finance';
import { DataTable, ErrorState, Skeleton } from '@/components/console/ui';
import { FieldsDrawer, toText, type FieldSpec } from '@/components/console/kit/FieldsDrawer';

/**
 * MVAG 2025 (9 Nov): the rules each country and state sets for aggregators. The fare band, the
 * cancellation fee and the driver insurance and training gate, with every value a state leaves
 * blank taken from the country. A change is a request a second admin approves. Active
 * commission rules above a cap are listed in red and never changed by the system.
 */
export type RegulationRow = {
  country: string; state_code: string; configured: boolean;
  base_fare_source: string | null; max_dynamic_multiplier: string | null; min_dynamic_multiplier: string | null;
  cancel_penalty_percent: string | null; cancel_penalty_cap_minor: number | null; cancel_free_seconds: number | null;
  driver_records_gate: boolean | null; health_insurance_min_sum: number | null;
  term_insurance_min_sum: number | null; induction_min_hours: string | null;
  note: string; version: number; updated_by: string;
};
type ZoneBand = {
  zone: string; country: string; state_code: string; rate_card_cap: string | null;
  effective: { max_dynamic_multiplier: string; min_dynamic_multiplier: string | null; cap_source: string } | null;
};
type AboveCap = { rule_id: number; percent: string; cap: string; level: string; geo_node: string | null };
type StateCap = { state_code: string; max_percent: string | null };
type CapConfig = { country: string; max_percent: string | null; states?: StateCap[]; rules_above_cap?: AboveCap[] };

const CURRENCY: Record<string, string> = { IN: 'INR', US: 'USD' };

const FIELDS: FieldSpec[] = [
  { key: 'base_fare_source', label: 'Base fare set by', kind: 'select',
    options: [{ value: 'state_notified', label: 'The state (notified)' }, { value: 'platform', label: 'The platform' }] },
  { key: 'max_dynamic_multiplier', label: 'Highest demand multiplier (e.g. 2.00)', kind: 'number' },
  { key: 'min_dynamic_multiplier', label: 'Lowest demand multiplier (e.g. 0.50)', kind: 'number' },
  { key: 'cancel_penalty_percent', label: 'Cancellation fee (% of the fare)', kind: 'number' },
  { key: 'cancel_penalty_cap_minor', label: 'Cancellation fee cap (minor units, 10000 = ₹100)', kind: 'number' },
  { key: 'cancel_free_seconds', label: 'Free window after the driver accepts (seconds)', kind: 'number' },
  { key: 'driver_records_gate', label: 'Driver insurance and training gate is on', kind: 'bool',
    help: 'When on, a driver without current health and term insurance and the induction hours cannot go online.' },
  { key: 'health_insurance_min_sum', label: 'Health insurance, smallest sum insured (whole rupees)', kind: 'number' },
  { key: 'term_insurance_min_sum', label: 'Term insurance, smallest sum insured (whole rupees)', kind: 'number' },
  { key: 'induction_min_hours', label: 'Induction training (hours)', kind: 'number' },
  { key: 'note', label: 'Note (e.g. the state notification number)', kind: 'text' },
];

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const scopeName = (r: RegulationRow) => (r.state_code ? `${r.country}-${r.state_code}` : `All of ${r.country}`);

export function RegulationPanel({ may }: { may: boolean }) {
  const [rows, setRows] = useState<RegulationRow[] | null>(null);
  const [zones, setZones] = useState<ZoneBand[]>([]);
  const [caps, setCaps] = useState<CapConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RegulationRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [reg, cfg] = await Promise.all([
        api.get<{ results: RegulationRow[]; zones: ZoneBand[] }>(withScope('/pricing/admin/regulation/')),
        api.get<{ results: CapConfig[] }>(withScope('/pricing/admin/commission/config/')),
      ]);
      setRows(reg.results); setZones(reg.zones); setCaps(cfg.results);
    } catch (err) {
      setRows([]);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The regulation settings could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const above = caps.flatMap((c) => (c.rules_above_cap ?? []).map((r) => ({ ...r, country: c.country })));

  return (
    <section className="ops-card" aria-labelledby="pr-mvag">
      <header className="ops-card__head">
        <div>
          <h2 id="pr-mvag">Aggregator rules (MVAG 2025)</h2>
          <p>Per country, and per state where a state notifies its own values. A blank state value uses the country&rsquo;s.</p>
        </div>
      </header>
      {notice ? <div className="ops-confirm mb-3" role="status"><b>{notice}</b></div> : null}
      {above.length > 0 ? (
        <div className="alert-error mb-3" role="alert">
          <b>{above.length} active commission rule{above.length === 1 ? ' is' : 's are'} above the cap.</b>{' '}
          {above.map((r) => `Rule ${r.rule_id} (${r.geo_node ?? r.country}, ${Number(r.percent)}% over ${Number(r.cap)}%)`).join(' · ')}.
          {' '}They stay as they are until someone changes them.
        </div>
      ) : null}
      {rows === null ? <Skeleton kind="row" count={3} /> : error ? (
        <ErrorState title="The regulation settings could not be loaded" detail={error} onRetry={() => void load()} />
      ) : (
        <>
          <DataTable caption="Aggregator rules by country and state" rows={rows} rowKey={(r) => `${r.country}-${r.state_code}`}
            density="compact" maxHeight={false}
            columns={[
              { key: 'scope', label: 'Where', render: (r) => scopeName(r) },
              { key: 'band', label: 'Demand band', render: (r) => (r.max_dynamic_multiplier || r.min_dynamic_multiplier
                ? `${dash(r.min_dynamic_multiplier)}× to ${dash(r.max_dynamic_multiplier)}×` : 'Not set here') },
              { key: 'cancel', label: 'Cancellation fee', render: (r) => (r.cancel_penalty_percent
                ? `${Number(r.cancel_penalty_percent)}%, at most ${r.cancel_penalty_cap_minor !== null ? formatMinor(r.cancel_penalty_cap_minor, CURRENCY[r.country] ?? 'INR') : '—'}, free for ${Math.round((r.cancel_free_seconds ?? 0) / 60)} min`
                : 'Not set here') },
              { key: 'gate', label: 'Driver records gate', render: (r) => (r.driver_records_gate === null ? 'Not set here' : r.driver_records_gate ? 'On' : 'Off') },
              { key: 'cap', label: 'Commission cap', render: (r) => {
                const c = caps.find((x) => x.country === r.country);
                const s = r.state_code ? c?.states?.find((x) => x.state_code === r.state_code)?.max_percent : c?.max_percent;
                return s ? `${Number(s)}%` : r.state_code ? 'Country cap' : 'Not set';
              } },
              { key: 'note', label: 'Note', hideBelow: 1100, render: (r) => r.note || '—' },
              { key: 'edit', label: '', render: (r) => (may ? (
                <button type="button" className="ops-linkbtn" onClick={() => setEditing(r)}>Change…</button>
              ) : null) },
            ]} />
          {zones.length > 0 ? (
            <div className="mt-3">
              <DataTable caption="What each city's fare is held to" rows={zones} rowKey={(z) => z.zone} density="compact" maxHeight={false}
                columns={[
                  { key: 'zone', label: 'City zone', render: (z) => z.zone },
                  { key: 'card', label: 'Rate card cap', num: true, render: (z) => (z.rate_card_cap ? `${z.rate_card_cap}×` : '—') },
                  { key: 'eff', label: 'Applied band', render: (z) => (z.effective
                    ? `${z.effective.min_dynamic_multiplier ?? '—'}× to ${z.effective.max_dynamic_multiplier}× (cap from the ${z.effective.cap_source.replace('_', ' ')})`
                    : 'No rate card') },
                ]} />
            </div>
          ) : null}
        </>
      )}
      {editing ? (
        <FieldsDrawer title={`Aggregator rules · ${scopeName(editing)}`} fields={FIELDS}
          initial={Object.fromEntries(FIELDS.map((f) => [f.key, toText((editing as Record<string, unknown>)[f.key])]))}
          note="Blank means the value is not set here. For a state, the country's value then applies."
          send={(changes, reason) => {
            const clear = Object.entries(changes).filter(([, v]) => v === null).map(([k]) => k);
            const set = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== null));
            return api.put(`/pricing/admin/regulation/${editing.country}/`,
              { state_code: editing.state_code, ...set, clear, reason });
          }}
          onClose={() => setEditing(null)}
          onDone={(text) => { setEditing(null); setNotice(text); void load(); }} />
      ) : null}
    </section>
  );
}
