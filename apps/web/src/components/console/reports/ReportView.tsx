'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api, apiDownload } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import { useDensity } from '@/lib/consolePrefs';
import {
  type Catalogue, type ReportBody, type ReportColumn, type ReportFilters, type Row, CHART_DEFAULT,
  GRANULARITIES, MAX_RANGE_DAYS, RANGE_PRESETS, chartableColumns, currenciesOf, exportPath,
  filtersFromParams, filtersToQuery, formatCell, granularityNote, groupWord, pivot, presetRange,
  periodLabel, rangeProblem, reportPath, rowsOfCurrency, todayLocal,
} from '@/lib/reports';
import { Download } from '@/components/console/icons';
import {
  type Column, DataTable, Empty, ErrorState, MetricTile, PageHeader, Panel, Skeleton, TableToolbar, TileGrid,
} from '@/components/console/ui';
import { CohortTable, Funnel, StackedBars } from './charts';

/**
 * One report: filters, chart, per-currency totals, table, "data as of", export.
 *
 * READ-ONLY. The numbers come from the daily rollups; nothing on this page changes a trip, an
 * account or a setting. A day is the city's own calendar day. Money is per currency: each currency
 * has its own totals and its own chart, and no figure anywhere adds one currency to another.
 */

const TILE_KEYS: Record<string, string[]> = {
  revenue: ['gmv_minor', 'rider_paid_minor', 'commission_minor', 'take_rate', 'net_take_minor'],
  promotions_cost: ['promo_cost_minor', 'incentive_rewards_minor', 'referral_rewards_minor', 'total_cost_minor'],
  payouts: ['requested_minor', 'paid_minor', 'failed_minor'],
  trips: ['trips_requested', 'trips_completed', 'completion_rate', 'avg_eta_seconds'],
  supply: ['active_drivers', 'online_hours', 'trips_completed', 'utilisation'],
  riders: ['new_riders', 'active_riders', 'first_trip_riders'],
  support: ['opened', 'resolved', 'breach_rate', 'avg_first_response_seconds'],
  safety: ['incidents', 'sos_events', 'sos_avg_response_seconds'],
  fraud: ['raised', 'confirmed', 'dismissed', 'confirm_rate'],
};

const GROUP_WORDS: Record<string, string> = { none: 'No breakdown', vehicle: 'Vehicle class', city: 'City' };
const GRAN_WORDS: Record<string, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

function Filters({
  filters, catalogue, groups, showVehicle, noPeriod, onApply,
}: {
  filters: ReportFilters; catalogue: Catalogue | null; groups: string[]; showVehicle: boolean; noPeriod: boolean;
  onApply: (f: ReportFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters]);
  const problem = rangeProblem(draft.from, draft.to);
  const note = granularityNote(draft.granularity, draft.from, draft.to);
  const set = (patch: Partial<ReportFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const cities = catalogue?.cities ?? [];
  return (
    <form className="ops-rangebar" aria-label="Report filters"
      onSubmit={(e) => { e.preventDefault(); if (!problem) onApply(draft); }}>
      <div className="ops-rangebar__field">
        <label className="ops-form__label" htmlFor="rp-from">From</label>
        <input id="rp-from" type="date" className="ops-select" value={draft.from} max={todayLocal()}
          onChange={(e) => set({ from: e.target.value })} />
      </div>
      <div className="ops-rangebar__field">
        <label className="ops-form__label" htmlFor="rp-to">To</label>
        <input id="rp-to" type="date" className="ops-select" value={draft.to} max={todayLocal()}
          onChange={(e) => set({ to: e.target.value })} />
      </div>
      {!noPeriod ? (
      <div className="ops-rangebar__field">
        <label className="ops-form__label" htmlFor="rp-gran">Period</label>
        <select id="rp-gran" className="ops-select" value={draft.granularity}
          onChange={(e) => set({ granularity: e.target.value as ReportFilters['granularity'] })}>
          {GRANULARITIES.map((g) => <option key={g} value={g}>{GRAN_WORDS[g]}</option>)}
        </select>
      </div>
      ) : null}
      {cities.length > 1 ? (
        <div className="ops-rangebar__field">
          <label className="ops-form__label" htmlFor="rp-city">City</label>
          <select id="rp-city" className="ops-select" value={draft.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">All in my scope</option>
            {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
      ) : null}
      {showVehicle && (catalogue?.vehicle_types.length ?? 0) > 0 ? (
        <div className="ops-rangebar__field">
          <label className="ops-form__label" htmlFor="rp-vehicle">Vehicle</label>
          <select id="rp-vehicle" className="ops-select" value={draft.vehicle} onChange={(e) => set({ vehicle: e.target.value })}>
            <option value="">All classes</option>
            {catalogue?.vehicle_types.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      ) : null}
      {groups.length > 1 ? (
        <div className="ops-rangebar__field">
          <label className="ops-form__label" htmlFor="rp-group">Break down by</label>
          <select id="rp-group" className="ops-select" value={draft.group} onChange={(e) => set({ group: e.target.value })}>
            {groups.map((g) => <option key={g} value={g}>{GROUP_WORDS[g] ?? g}</option>)}
          </select>
        </div>
      ) : null}
      <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={Boolean(problem)}>Show</button>
      <div className="ops-seg" role="group" aria-label="Date presets">
        {RANGE_PRESETS.map((p) => (
          <button key={p.days} type="button" className="ops-seg__btn"
            onClick={() => { const r = presetRange(p.days); onApply({ ...draft, ...r }); }}>{p.label}</button>
        ))}
      </div>
      {problem ? <span className="ops-rangebar__problem" role="alert">{problem}</span>
        : note ? <span className="help" role="note">{note}</span> : null}
    </form>
  );
}

function ExportButton({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try {
      const { blob, filename } = await apiDownload(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.');
    } finally { setBusy(false); }
  }
  return (
    <span className="ops-export">
      <button type="button" className="ops-toolbtn" disabled={busy} onClick={() => void run()}>
        <Download />{busy ? 'Preparing…' : 'Export CSV'}
      </button>
      {error ? <span className="ops-export__error" role="alert">{error}</span> : null}
    </span>
  );
}

function Totals({ body }: { body: ReportBody }) {
  const keys = TILE_KEYS[body.report.key] ?? body.columns.slice(0, 4).map((c) => c.key);
  const cols = keys.map((k) => body.columns.find((c) => c.key === k)).filter(Boolean) as ReportColumn[];
  if (!body.totals.length || !cols.length) return null;
  return (
    <>
      {body.totals.map((t) => {
        const cur = typeof t.currency === 'string' ? t.currency : null;
        return (
          <section key={cur ?? 'all'} aria-label={cur ? `Totals in ${cur}` : 'Totals'}>
            {cur ? <h2 className="rp-cur">{cur} <small>totals for the range, this currency only</small></h2> : null}
            <TileGrid>
              {cols.map((c) => (
                <MetricTile key={c.key} label={c.label} tone={c.type === 'money' ? 'money' : 'neutral'}
                  value={formatCell(c, t[c.key], cur)} />
              ))}
            </TileGrid>
          </section>
        );
      })}
    </>
  );
}

function ChartPanel({ body, metricKey, setMetric }: {
  body: ReportBody; metricKey: string; setMetric: (k: string) => void;
}) {
  const options = chartableColumns(body.columns);
  const column = options.find((c) => c.key === metricKey) ?? options[0];
  if (!column) return null;
  const currencies = column.type === 'money' ? currenciesOf(body) : [null];
  const g = body.params.granularity;
  return (
    <Panel title="Over time" action={
      <label className="rp-metric">
        <span className="ops-form__label">Chart</span>
        <select className="ops-select" value={column.key} onChange={(e) => setMetric(e.target.value)} aria-label="Chart metric">
          {options.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
    }>
      <div className="rp-charts">
        {currencies.map((cur) => (
          <StackedBars key={cur ?? 'all'} column={column} currency={cur} granularity={g}
            pivot={pivot(rowsOfCurrency(body.rows, cur), column.key, 'All')}
            title={cur ? `${column.label} · ${cur}` : column.label} />
        ))}
      </div>
    </Panel>
  );
}

function ReportInner() {
  const { key } = useParams<{ key: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const fallback = useMemo(() => presetRange(30), []);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [body, setBody] = useState<ReportBody | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [metric, setMetric] = useState<string>('');
  const [density, setDensity] = useDensity();

  const card = catalogue?.areas.flatMap((a) => a.reports).find((r) => r.key === key);
  const base = filtersFromParams((k) => search.get(k), fallback, '');
  const query = filtersToQuery(base);
  // The group the screen shows; nothing is sent for it until the operator chooses one.
  const filters: ReportFilters = { ...base, group: base.group || card?.default_group || body?.report.default_group || '' };

  useEffect(() => {
    api.get<Catalogue>('/reports/admin/catalogue/').then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  const load = useCallback(async () => {
    setBody(null); setError(null);
    const f: ReportFilters = filtersFromParams((k) => new URLSearchParams(query).get(k), fallback, '');
    const problem = rangeProblem(f.from, f.to);
    if (problem) { setError({ status: 400, message: problem }); return; }
    try {
      const data = await api.get<ReportBody>(reportPath(key, f));
      setBody(data);
    } catch (err) {
      setError({
        status: err instanceof ApiError ? err.status : 0,
        message: err instanceof ApiError && err.fromServer ? err.message : 'We could not load this report.',
      });
    }
  }, [key, query, fallback]);
  useEffect(() => { void load(); }, [load]);

  const go = (f: ReportFilters) => router.push(`/reports/${key}?${filtersToQuery(f)}`);

  const columns: Column<Row>[] = useMemo(() => {
    if (!body) return [];
    const dims: Column<Row>[] = [
      { key: 'period', label: 'Period', width: '7.5rem', sortValue: (r) => r.period, render: (r) => periodLabel(r.period, body.params.granularity) + (body.params.granularity === 'day' ? ` ${r.period.slice(0, 4)}` : '') },
    ];
    if (body.params.group_by === 'vehicle') dims.push({ key: 'vehicle', label: 'Vehicle', sortValue: (r) => String(r.vehicle ?? ''), render: (r) => groupWord(String(r.vehicle ?? '—')) });
    if (body.params.group_by === 'city') dims.push({ key: 'city', label: 'City', sortValue: (r) => String(r.city ?? ''), render: (r) => String(r.city ?? '—') });
    if (body.report.money) dims.push({ key: 'currency', label: 'Currency', width: '6rem', sortValue: (r) => String(r.currency ?? ''), render: (r) => String(r.currency ?? '') });
    return [
      ...dims,
      ...body.columns.map((c): Column<Row> => ({
        key: c.key, label: c.label, num: true,
        sortValue: (r) => (typeof r[c.key] === 'number' ? (r[c.key] as number) : null),
        render: (r) => formatCell(c, r[c.key], typeof r.currency === 'string' ? r.currency : null),
      })),
    ];
  }, [body]);

  const title = card?.title ?? body?.report.title ?? 'Report';
  const empty = body !== null && body.rows.length === 0 && !body.cohorts?.length;

  if (error && (error.status === 403 || error.status === 404)) {
    return (
      <>
        <PageHeader title="Report" />
        <Empty title={error.status === 403 ? 'You cannot open this report' : 'Nothing here'}
          detail={error.status === 403 ? 'Your role does not include it. The catalogue lists the reports you can open.' : error.message} />
        <p><Link href="/reports">Back to the catalogue</Link></p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} subtitle={card?.description ?? body?.report.description}
        actions={body ? <ExportButton path={exportPath(key, filters)} /> : undefined} />
      <nav className="ops-subnav" aria-label="Reports"><Link href="/reports" className="ops-subnav__link">All reports</Link></nav>
      <Panel flush>
        <Filters filters={filters} catalogue={catalogue} groups={card?.groups ?? body?.report.groups ?? []}
          showVehicle={(card?.groups ?? body?.report.groups ?? []).includes('vehicle')} noPeriod={key === 'rider_retention'} onApply={go} />
        <TableToolbar
          summary={body ? `${body.rows.length || body.cohorts?.length || 0} row${(body.rows.length || body.cohorts?.length || 0) === 1 ? '' : 's'} · ${body.params.from} to ${body.params.to} · days are each city's own` : null}
          density={density} onDensity={setDensity} />
        <p className="rp-asof" role="status">
          {body ? (body.as_of ? `Data as of ${stamp(body.as_of)} (last rebuild of these days).` : 'No rollup has been built for these days yet.') : ''}
        </p>
      </Panel>

      {body === null && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the report</span><Skeleton kind="row" count={6} />
        </div>
      ) : error ? (
        <ErrorState title="The report could not be loaded" detail={`${error.message} This is not the same as there being no data.`} onRetry={() => void load()} />
      ) : empty ? (
        <Empty title="No data in this range"
          detail={body?.as_of ? 'Nothing happened in your scope between these dates.' : 'The rollups have not been built for these days. They are rebuilt every 30 minutes for today and yesterday, and nightly for the last week.'} />
      ) : body ? (
        <>
          {body.report.key === 'rider_retention' ? (
            <Panel title="Retention by cohort"><CohortTable cohorts={body.cohorts ?? []} /></Panel>
          ) : (
            <>
              <Totals body={body} />
              {body.extra.funnel ? <Panel><Funnel stages={body.extra.funnel} /></Panel> : null}
              <ChartPanel body={body} metricKey={metric || CHART_DEFAULT[body.report.key] || ''} setMetric={setMetric} />
              <Panel flush>
                <div className="rp-table"><DataTable caption={`${title}: ${body.params.granularity} table`} rows={body.rows} columns={columns}
                  rowKey={(r) => `${r.period}|${r.vehicle ?? r.city ?? ''}|${r.currency ?? ''}`} density={density}
                  defaultSort={{ key: 'period', dir: 'desc' }} /></div>
              </Panel>
              {body.extra.kinds?.length ? (
                <Panel title="By rule"><ul className="fr-evidence">{body.extra.kinds.map((k) => <li key={k.kind}>{k.kind.replace(/_/g, ' ')}: {k.raised} raised, {k.confirmed} confirmed, {k.dismissed} dismissed</li>)}</ul></Panel>
              ) : null}
              {body.extra.incident_categories?.length || body.extra.sos_types?.length ? (
                <Panel title="Counts by kind"><ul className="fr-evidence">
                  {(body.extra.incident_categories ?? []).map((k) => <li key={`i-${k.kind}`}>Incidents, {k.kind.replace(/_/g, ' ')}: {k.count}</li>)}
                  {(body.extra.sos_types ?? []).map((k) => <li key={`s-${k.kind}`}>SOS, {k.kind.replace(/_/g, ' ')}: {k.count}</li>)}
                </ul></Panel>
              ) : null}
            </>
          )}
          <Panel title="How these figures are measured">
            <ul className="rp-defs">{body.report.definitions.map((d) => <li key={d}>{d}</li>)}</ul>
            <p className="help m-0">Up to {MAX_RANGE_DAYS} days per request.</p>
          </Panel>
        </>
      ) : null}
    </>
  );
}

export default function ReportView() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <ReportInner />
    </Suspense>
  );
}
