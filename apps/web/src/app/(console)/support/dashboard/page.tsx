'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { useDensity } from '@/lib/consolePrefs';
import {
  type Dashboard, type DashboardStats, PRIORITY_LABEL, dashboardPath, dashboardRangeError,
  formatMedian, formatPct, priorityTone,
} from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, Stat, StatStrip,
} from '@/components/console/ui';

/**
 * Support SLA dashboard.
 *
 * TABLES FIRST. Every number is a cell a screen reader can walk, with a
 * caption and column headers; nothing here is only a picture.
 *
 * Per city and priority, then per agent, for tickets OPENED in the date
 * range, each cut at its own city's midnight. "Met %" is of the tickets whose
 * deadline has already come (answered, or past due), so a ticket that is not
 * due yet neither helps nor hurts, and a dash means nothing was due. The two
 * right-now columns (breaching, paused) look at every open ticket in your
 * scope, not only those opened in the range. A paused ticket is waiting on
 * the user: its resolution clock is stopped, so it is never counted as
 * breaching. Agents are staff; riders and drivers are not named here.
 */
const failure = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.fromServer ? err.message : fallback;

const statColumns = <T extends DashboardStats>(): Column<T>[] => [
  { key: 'opened', label: 'Opened', width: '6rem', num: true, render: (r) => r.opened.toLocaleString('en-IN') },
  { key: 'fr', label: 'First reply met', width: '9rem', num: true, render: (r) => formatPct(r.first_response_met_pct) },
  { key: 'res', label: 'Resolution met', width: '9rem', num: true, render: (r) => formatPct(r.resolution_met_pct) },
  { key: 'med', label: 'Median first reply', width: '9.5rem', num: true, render: (r) => formatMedian(r.median_first_response_minutes) },
  {
    key: 'breach', label: 'Breaching now', width: '8.5rem', num: true,
    render: (r) => (r.currently_breaching > 0 ? <Pill tone="bad">{r.currently_breaching}</Pill> : r.currently_breaching),
  },
  { key: 'paused', label: 'Paused', width: '6rem', num: true, render: (r) => r.paused },
];

export default function DashboardPage() {
  const access = useAdminAccess();
  const [density] = useDensity();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [scope, setScope] = useState('');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  const rangeError = dashboardRangeError(dateFrom, dateTo);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.get<Dashboard>(dashboardPath(applied.from, applied.to, scope)));
    } catch (err) {
      setError(failure(err, 'We could not load the dashboard.'));
    }
  }, [applied, scope]);

  useEffect(() => { void load(); }, [load]);

  const cityRows = data?.rows ?? [];
  const cityColumns: Column<Dashboard['rows'][number]>[] = [
    { key: 'city', label: 'City', width: '12rem', render: (r) => r.city.name },
    {
      key: 'priority', label: 'Priority', width: '7rem',
      render: (r) => <Pill tone={priorityTone(r.priority)}>{PRIORITY_LABEL[r.priority] ?? r.priority}</Pill>,
    },
    ...statColumns<Dashboard['rows'][number]>(),
  ];
  const agentColumns: Column<Dashboard['agents'][number]>[] = [
    { key: 'agent', label: 'Agent', width: '14rem', render: (r) => (r.unassigned ? <span className="muted">Unassigned</span> : r.agent?.label || `Operator #${r.agent?.id}`) },
    ...statColumns<Dashboard['agents'][number]>(),
  ];
  const totalColumns: Column<Dashboard['cities'][number]>[] = [
    { key: 'city', label: 'City', width: '12rem', render: (r) => r.city.name },
    ...statColumns<Dashboard['cities'][number]>(),
  ];

  return (
    <>
      <PageHeader
        title="SLA dashboard"
        subtitle="How the desk is doing against its clocks. Tickets opened in the range, each cut at its own city's midnight."
        actions={<ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>}
      />

      <Panel title="Range">
        <form
          className="ops-form" aria-label="Choose the range"
          onSubmit={(e) => { e.preventDefault(); if (!rangeError) setApplied({ from: dateFrom, to: dateTo }); }}
        >
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="d-from">From</label>
            <input id="d-from" type="date" className="ops-select" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <label className="ops-form__label" htmlFor="d-to">To</label>
            <input id="d-to" type="date" className="ops-select" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            {cities.length > 1 ? (
              <>
                <label className="ops-form__label" htmlFor="d-city">City</label>
                <select id="d-city" className="ops-select" value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="">All I hold</option>
                  {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </>
            ) : null}
            <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={Boolean(rangeError)}>Show</button>
          </div>
          <p className="help m-0" id="d-help">
            {rangeError ?? 'Leave both empty for the last 7 days. The range can be at most 92 days.'}
          </p>
        </form>
      </Panel>

      {error ? (
        <ErrorState title="The dashboard could not be loaded" detail={`${error} This is not the same as there being no tickets.`} onRetry={() => void load()} />
      ) : data === null ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the dashboard</span>
          <Skeleton kind="row" count={8} />
        </div>
      ) : (
        <>
          <p className="help" role="status">
            {data.date_from} to {data.date_to} · as of {stamp(data.as_of)}
            {data.truncated ? ' · very large range: the oldest tickets were left out' : ''}
          </p>
          <StatStrip>
            <Stat label="Opened" value={data.totals.opened.toLocaleString('en-IN')} />
            <Stat label="First reply met" value={formatPct(data.totals.first_response_met_pct)} />
            <Stat label="Resolution met" value={formatPct(data.totals.resolution_met_pct)} />
            <Stat label="Median first reply" value={formatMedian(data.totals.median_first_response_minutes)} />
            <Stat label="Breaching now" value={String(data.totals.currently_breaching)} />
            <Stat label="Paused" value={String(data.totals.paused)} />
          </StatStrip>

          {data.cities.length === 0 && data.agents.length === 0 ? (
            <Empty title="No tickets in this range" detail="Nothing was opened in these dates in your scope, and nothing open is late." />
          ) : (
            <>
              <Panel title="By city" flush>
                <DataTable caption="Tickets by city" rows={data.cities} columns={totalColumns} rowKey={(r) => r.city.code ?? r.city.name} density={density} maxHeight={false} />
              </Panel>
              <Panel title="By city and priority" flush>
                <DataTable caption="Tickets by city and priority" rows={cityRows} columns={cityColumns} rowKey={(r) => `${r.city.code}:${r.priority}`} density={density} maxHeight={false} />
              </Panel>
              <Panel title="By agent" flush>
                <DataTable caption="Tickets by agent" rows={data.agents} columns={agentColumns} rowKey={(r) => r.agent?.id ?? 'none'} density={density} maxHeight={false} />
              </Panel>
            </>
          )}
        </>
      )}
    </>
  );
}
