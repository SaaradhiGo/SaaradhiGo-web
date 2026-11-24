'use client';

import { marketDate, parseMarketDate } from '@/lib/consoleTime';
import { DatePresets } from '@/components/console/kit/DatePresets';
import { readSelectedScope } from '@/lib/adminScope';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api, apiDownload } from '@/lib/api';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { currentScope, useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import {
  type Catalogue, type ReportBody, type ReportColumn, type ReportCountry, type ReportFilters, type Row, CHART_DEFAULT,
  GRANULARITIES, MAX_RANGE_DAYS, chartableColumns, currenciesOf, exportPath,
  filtersFromParams, filtersToQuery, formatCell, granularityNote, groupWord, pivot, presetRange,
  periodLabel, rangeProblem, reportPath, rowsOfCurrency, todayLocal,
} from '@/lib/reports';
import { Download } from '@/components/console/icons';
import {
  type Column, Empty, ErrorState, Panel, Skeleton, TableToolbar,
} from '@/components/console/ui';
import { MetricCard } from '@/components/console/kit/MetricCard';
import { PageHead } from '@/components/console/kit/ListBits';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
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
  const market = marketOf(draft.city);
  return (
    <>
    <PlaceChips filters={filters} catalogue={catalogue} onApply={onApply} />
    <form className="ops-rangebar" aria-label="Report filters"
      onSubmit={(e) => { e.preventDefault(); if (!problem) onApply(draft); }}>
      <MarketDateField id="rp-from" label="From" value={draft.from} market={market} onChange={(v) => set({ from: v })} />
      <MarketDateField id="rp-to" label="To" value={draft.to} market={market} onChange={(v) => set({ to: v })} />
      {!noPeriod ? (
      <div className="ops-rangebar__field">
        <label className="ops-form__label" htmlFor="rp-gran">Period</label>
        <select id="rp-gran" className="ops-select" value={draft.granularity}
          onChange={(e) => set({ granularity: e.target.value as ReportFilters['granularity'] })}>
          {GRANULARITIES.map((g) => <option key={g} value={g}>{GRAN_WORDS[g]}</option>)}
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
      <DatePresets from={draft.from} to={draft.to} customFieldId="rp-from" onPick={(r) => onApply({ ...draft, ...r })} />
      {problem ? <span className="ops-rangebar__problem" role="alert">{problem}</span>
        : note ? <span className="help" role="note">{note}</span> : null}
    </form>
    </>
  );
}

/** The market a place code belongs to: its country prefix; nothing chosen reads as India. */
function marketOf(code: string | null | undefined): string {
  const c = (code || readSelectedScope() || '').toUpperCase();
  return c.startsWith('US') ? 'US' : 'IN';
}

/** A date typed and shown the way the market writes it ("20 Nov 2026", "Nov 20, 2026"); sent as ISO. */
function MarketDateField({ id, label, value, market, onChange }: {
  id: string; label: string; value: string; market: string; onChange: (iso: string) => void;
}) {
  const [text, setText] = useState(marketDate(value, market));
  useEffect(() => setText(marketDate(value, market)), [value, market]);
  const bad = text.trim() !== '' && parseMarketDate(text) === null;
  return (
    <div className="ops-rangebar__field">
      <label className="ops-form__label" htmlFor={id}>{label}</label>
      <input id={id} type="text" className="ops-select" value={text} inputMode="text" autoComplete="off"
        placeholder={market === 'US' ? 'Nov 20, 2026' : '20 Nov 2026'} aria-invalid={bad || undefined}
        onChange={(e) => { setText(e.target.value); const iso = parseMarketDate(e.target.value); if (iso) onChange(iso); }}
        onBlur={() => { const iso = parseMarketDate(text); if (iso) setText(marketDate(iso, market)); }} />
    </div>
  );
}

/**
 * 24 Nov (owner): places as chips. More than one country: "All countries" and one chip per
 * country. A country chosen: its cities as chips. Never a long dropdown.
 */
function PlaceChips({ filters, catalogue, onApply }: {
  filters: ReportFilters; catalogue: Catalogue | null; onApply: (f: ReportFilters) => void;
}) {
  const cities = catalogue?.cities ?? [];
  const countries = [...new Set(cities.map((c) => c.code.split('-')[0]))];
  const chosen = filters.city.toUpperCase();
  const country = chosen ? chosen.split('-')[0] : countries.length === 1 ? countries[0] : '';
  const inCountry = country ? cities.filter((c) => c.code.startsWith(`${country}-`)) : [];
  if (countries.length < 2 && inCountry.length < 2) return null;
  const chip = (code: string, label: string) => (
    <button key={code || 'all'} type="button" className="ops-placechip" aria-pressed={chosen === code}
      onClick={() => onApply({ ...filters, city: code, group: code ? filters.group : '' })}>{label}</button>
  );
  return (
    <nav className="ops-placechips rp-places" aria-label="Place">
      {countries.length > 1 ? chip('', 'All countries') : null}
      {countries.length > 1 && !country ? countries.map((c) => chip(c, COUNTRY_NAMES[c] ?? c)) : null}
      {country && countries.length > 1 ? chip(country, `All of ${COUNTRY_NAMES[country] ?? country}`) : null}
      {country && countries.length < 2 && inCountry.length > 1 ? chip('', `All of ${COUNTRY_NAMES[country] ?? country}`) : null}
      {inCountry.length > 1 ? inCountry.map((c) => chip(c.code, c.name)) : null}
    </nav>
  );
}

const COUNTRY_NAMES: Record<string, string> = { IN: 'India', US: 'United States' };

/** One tile per country, in its own currency and its cities' own days (24 Nov). Never a sum. */
function CountryReportTiles({ body, onOpen }: { body: ReportBody; onOpen: (code: string) => void }) {
  const keys = TILE_KEYS[body.report.key] ?? body.columns.slice(0, 4).map((c) => c.key);
  const cols = keys.map((k) => body.columns.find((c) => c.key === k)).filter(Boolean) as ReportColumn[];
  const market = (c: ReportCountry) => (c.code === 'US' ? 'US' : 'IN');
  return (
    <section className="ops-today__countries rp-countries" aria-label="By country">
      {(body.countries ?? []).map((c) => {
        const t = c.totals.find((r) => r.currency === c.currency) ?? c.totals[0] ?? {};
        return (
          <button key={c.code} type="button" className="ops-today__country" onClick={() => onOpen(c.code)} aria-label={`Open ${c.name}`}>
            <span className="ops-today__country-head"><b>{c.name}</b>
              <span className="muted">{c.currency} · {marketDate(body.params.from, market(c))} to {marketDate(body.params.to, market(c))}, local days</span></span>
            <dl className="ops-today__facts">
              {cols.map((col) => (
                <div key={col.key}><dt>{col.label}</dt><dd className="sg-num">{formatCell(col, t[col.key], c.currency)}</dd></div>
              ))}
            </dl>
          </button>
        );
      })}
    </section>
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
            <div className="ops-metrics mb-4">
              {cols.map((c) => (
                <MetricCard key={c.key} label={c.label} value={formatCell(c, t[c.key], cur)} />
              ))}
            </div>
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

/** Column types that add up across days; rates and averages do not. */
const SUMMABLE = new Set(['count', 'money', 'hours', 'km', 'minutes']);

/** One row per place (and currency): the period rows of a city breakdown, added up. */
function byPlace(body: ReportBody): Row[] {
  const out = new Map<string, Row>();
  const cols = body.columns.filter((c) => SUMMABLE.has(c.type));
  for (const r of body.rows) {
    const k = `${r.city ?? ''}|${r.currency ?? ''}`;
    let acc = out.get(k);
    if (!acc) {
      acc = { period: '', city: r.city ?? null, currency: r.currency ?? null };
      for (const c of cols) acc[c.key] = 0;
      out.set(k, acc);
    }
    for (const c of cols) {
      const v = r[c.key];
      if (typeof v === 'number' && Number.isFinite(v)) acc[c.key] = (acc[c.key] as number) + v;
    }
  }
  const lead = cols[0]?.key;
  return [...out.values()].sort((a, b) => String(a.currency ?? '').localeCompare(String(b.currency ?? ''))
    || (lead ? (b[lead] as number) - (a[lead] as number) : 0)
    || String(a.city ?? '').localeCompare(String(b.city ?? '')));
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
  const access = useAdminAccess();

  const card = catalogue?.areas.flatMap((a) => a.reports).find((r) => r.key === key);
  const base = filtersFromParams((k) => search.get(k), fallback, '');
  const query = filtersToQuery(base);
  // The group the screen shows; nothing is sent for it until the operator chooses one.
  const filters: ReportFilters = { ...base, group: base.group || card?.default_group || body?.report.default_group || '' };

  useEffect(() => {
    api.get<Catalogue>(withScope('/reports/admin/catalogue/')).then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  const load = useCallback(async () => {
    setBody(null); setError(null);
    const f: ReportFilters = filtersFromParams((k) => new URLSearchParams(query).get(k), fallback, '');
    const problem = rangeProblem(f.from, f.to);
    if (problem) { setError({ status: 400, message: problem }); return; }
    try {
      const data = await api.get<ReportBody>(withScope(reportPath(key, f)));
      setBody(data);
    } catch (err) {
      setError({
        status: err instanceof ApiError ? err.status : 0,
        message: err instanceof ApiError && err.fromServer ? err.message : 'We could not load this report.',
      });
    }
  }, [key, query, fallback]);
  useEffect(() => { void load(); }, [load]);

  const go = (f: ReportFilters) => router.push(`/ops/reports/${key}?${filtersToQuery(f)}`);

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

  const groups = card?.groups ?? body?.report.groups ?? [];
  const [tableView, setTableView] = useState<'period' | 'place'>(() => (search.get('table') === 'place' ? 'place' : 'period'));
  const tableViews = [
    { key: 'period', label: 'By period' },
    ...(groups.includes('city') ? [{ key: 'place', label: 'By place' }] : []),
  ];
  const chooseTable = (v: string) => {
    const next = v === 'place' ? 'place' : 'period';
    setTableView(next);
    // A place breakdown needs the rows split by city; ask the server for them.
    if (next === 'place' && filters.group !== 'city') router.push(`/ops/reports/${key}?${filtersToQuery({ ...filters, group: 'city' })}&table=place`);
  };
  const listColumns: ListColumn<Row>[] = columns.map((c) => ({ key: c.key, label: String(c.label), num: c.num, render: c.render }));
  const periodRows = useMemo(() => [...(body?.rows ?? [])].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0)), [body]);
  const placeRows = useMemo(() => (body && body.params.group_by === 'city' ? byPlace(body) : []), [body]);
  const placeColumns: ListColumn<Row>[] = body ? [
    { key: 'city', label: 'Place', primary: true, render: (r) => String(r.city ?? '—') },
    ...(body.report.money ? [{ key: 'currency', label: 'Currency', render: (r: Row) => String(r.currency ?? '') }] : []),
    ...body.columns.filter((c) => SUMMABLE.has(c.type)).map((c): ListColumn<Row> => ({
      key: c.key, label: c.label, num: true,
      render: (r) => formatCell(c, r[c.key], typeof r.currency === 'string' ? r.currency : null),
    })),
  ] : [];
  // A report's clock is its market's: the chosen city's zone, else the first city in scope.
  const cityZones = (catalogue?.cities ?? []).filter((c) => !filters.city || c.code === filters.city).map((c) => c.timezone);
  const marketZone = cityZones[0] ?? timeZoneFor(currentScope(access)?.code);
  const title = card?.title ?? body?.report.title ?? 'Report';
  const empty = body !== null && body.rows.length === 0 && !body.cohorts?.length;

  if (error && (error.status === 403 || error.status === 404)) {
    return (
      <>
        <PageHead title="Report" />
        <Empty title={error.status === 403 ? 'You cannot open this report' : 'Nothing here'}
          detail={error.status === 403 ? 'Your role does not include it. The catalogue lists the reports you can open.' : error.message} />
        <p><Link href="/ops/reports">Back to the catalogue</Link></p>
      </>
    );
  }

  return (
    <>
      <p className="ops-record-page__back"><Link href="/ops/reports">All reports</Link></p>
      <PageHead title={title} summary={card?.description ?? body?.report.description}
        actions={body ? <ExportButton path={withScope(exportPath(key, filters))} /> : undefined} />
      <Panel flush>
        <Filters filters={filters} catalogue={catalogue} groups={card?.groups ?? body?.report.groups ?? []}
          showVehicle={(card?.groups ?? body?.report.groups ?? []).includes('vehicle')} noPeriod={key === 'rider_retention'} onApply={go} />
        <TableToolbar
          summary={body ? `${body.rows.length || body.cohorts?.length || 0} row${(body.rows.length || body.cohorts?.length || 0) === 1 ? '' : 's'} · ${marketDate(body.params.from, reportMarket())} to ${marketDate(body.params.to, reportMarket())} · days are each city's own` : null}
          density={density} onDensity={setDensity} />
        <p className="rp-asof" role="status">
          {body ? (body.as_of ? `Data as of ${stamp(body.as_of, marketZone)} (last rebuild of these days).` : 'No rollup has been built for these days yet.') : ''}
        </p>
      </Panel>

      {body === null && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the report</span><Skeleton kind="row" count={6} />
        </div>
      ) : error ? (
        <ErrorState title="The report could not be loaded" detail={`${error.message} This is not the same as there being no data.`} onRetry={() => void load()} />
      ) : empty && !(body?.countries?.length) ? (
        <Empty title="No data in this range"
          detail={body?.as_of ? 'Nothing counted in your scope between these dates. Test trips and test accounts are never counted, so on QA this is 0.' : 'The rollups have not been built for these days. They are rebuilt every 30 minutes for today and yesterday, and nightly for the last week.'} />
      ) : body ? (
        <>
          {(body.countries?.length ?? 0) > 1 ? (
            <>
              <CountryReportTiles body={body} onOpen={(code) => go({ ...filters, city: code, group: '' })} />
              <p className="help" role="note">Countries are never added together: each has its own currency and its own days. Choose a country for its cities, chart and table.</p>
            </>
          ) : body.report.key === 'rider_retention' ? (
            <Panel title="Retention by cohort"><CohortTable cohorts={body.cohorts ?? []} /></Panel>
          ) : (
            <>
              <Totals body={body} />
              {body.extra.funnel ? <Panel><Funnel stages={body.extra.funnel} /></Panel> : null}
              <ChartPanel body={body} metricKey={metric || CHART_DEFAULT[body.report.key] || ''} setMetric={setMetric} />
              {tableView === 'place' && body.params.group_by === 'city' ? (
                <ListPage<Row>
                  pageKey={`report-${key}-place`}
                  title="By place"
                  summary={`${marketDate(body.params.from, reportMarket())} to ${marketDate(body.params.to, reportMarket())}. Counts and money are added up per place${body.report.money ? ' and currency' : ''}; rates and averages are in the period table.`}
                  views={tableViews}
                  view={tableView}
                  onView={chooseTable}
                  columns={placeColumns}
                  rows={placeRows}
                  rowKey={(r) => `${r.city ?? ''}|${r.currency ?? ''}`}
                  total={placeRows.length}
                  page={1}
                  pageSize={Math.max(1, placeRows.length)}
                  onPage={() => undefined}
                  empty="No place has data in this range."
                />
              ) : (
                <ListPage<Row>
                  pageKey={`report-${key}-period`}
                  title="By period"
                  summary={`${body.rows.length} row${body.rows.length === 1 ? '' : 's'} · ${marketDate(body.params.from, reportMarket())} to ${marketDate(body.params.to, reportMarket())} · days are each city's own`}
                  views={tableViews}
                  view={tableView}
                  onView={chooseTable}
                  columns={listColumns}
                  rows={periodRows}
                  rowKey={(r) => `${r.period}|${r.vehicle ?? r.city ?? ''}|${r.currency ?? ''}`}
                  total={periodRows.length}
                  page={1}
                  pageSize={Math.max(1, periodRows.length)}
                  onPage={() => undefined}
                  empty="No rows in this range."
                />
              )}
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

/** The market whose date format the report uses: the selected place's country (22 Nov). */
function reportMarket(): string {
  const city = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('city') ?? '';
  return (city || readSelectedScope() || '').toUpperCase().startsWith('US') ? 'US' : 'IN';
}

export default function ReportView() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <ReportInner />
    </Suspense>
  );
}
