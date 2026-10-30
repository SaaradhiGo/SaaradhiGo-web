'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CITY_KEY, WINDOW_KEY, Window, isWindow, readStored, writeStored,
} from '@/lib/commandCentre';
import { useAlerts, useOverview } from '@/lib/useCommandCentre';
import { AdminAccess, getCachedAccess, scopeLabel } from '@/lib/adminScope';
import { boardLinks } from '@/lib/boardLinks';
import { longDate } from '@/lib/consoleTime';
import {
  Empty, ErrorState, PageHeader, Skeleton, TileGrid,
} from '@/components/console/ui';
import { AlertsPanel } from './AlertsPanel';
import { CityBoard } from './CityBoard';
import { CityWindowBar } from './CityWindowBar';
import { FinanceTiles } from './FinanceTiles';
import { LiveTrips } from './LiveTrips';

/**
 * The Command Centre: per city, what is wrong, what is waiting, and what is
 * happening -- against the same window a week ago.
 *
 * DENSE AND CALM. A board per city an operator can scan in seconds; red is
 * spent on an open SOS and on a critical alert and nothing else; gold on
 * money and on a figure past its warning line.
 *
 * EVERY PANEL HAS FOUR STATES. Loading is a skeleton; nothing is "no data
 * in this window", never a row of zeroes; an error says so and offers to
 * try again; a 403 hides the panel behind one line, because asking again
 * will not change the answer.
 *
 * Times are the city's own; numbers are in the country's locale; money is
 * one tile per currency.
 */
export function CommandCentre({ access: given }: { access?: AdminAccess | null } = {}) {
  const [access, setAccess] = useState<AdminAccess | null>(given ?? null);
  const [city, setCity] = useState<string | null>(null);
  const [win, setWin] = useState<Window>('today');
  const [hydrated, setHydrated] = useState(false);

  // After mount only: localStorage is unreadable during server rendering,
  // and reading it in useState makes the two renders disagree (React 418).
  useEffect(() => {
    setAccess(given ?? getCachedAccess());
    const storedWindow = readStored(WINDOW_KEY);
    if (isWindow(storedWindow)) setWin(storedWindow);
    setCity(readStored(CITY_KEY));
    setHydrated(true);
  }, [given]);

  const overview = useOverview(win, city);
  const alerts = useAlerts(city);

  // The city list is whatever the server lets this operator see. A
  // remembered city that is no longer offered (a revoked assignment, a
  // different region in the top bar) is dropped rather than sent back.
  const cities = useMemo(
    () => (overview.data?.cities ?? []).map((c) => ({ code: c.code, name: c.name, status: c.status })),
    [overview.data],
  );
  useEffect(() => {
    if (!overview.data || !city) return;
    if (!overview.data.cities.some((c) => c.code === city)) {
      setCity(null);
      writeStored(CITY_KEY, null);
    }
  }, [overview.data, city]);

  const onCity = useCallback((code: string | null) => {
    setCity(code);
    writeStored(CITY_KEY, code);
  }, []);
  const onWindow = useCallback((w: Window) => {
    setWin(w);
    writeStored(WINDOW_KEY, w);
  }, []);

  const rows = useMemo(() => overview.data?.cities ?? [], [overview.data]);
  const shown = city ? rows.filter((r) => r.code === city) : rows;
  const timeZones = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.code, r.timezone])),
    [rows],
  );
  const focusTz = shown.length === 1 ? shown[0].timezone : undefined;

  // Only the queues this caller is shown (the same gates as CityBoard's
  // "Waiting on you"), so the header never counts work they cannot see.
  const waiting = shown.reduce((n, r) => {
    const links = boardLinks(access, r.code);
    return n
      + (links.safety ? r.queues.sos_open?.now ?? 0 : 0)
      + (links.support ? r.queues.tickets_open.now ?? 0 : 0)
      + (links.withdrawals ? r.queues.withdrawals_pending?.now ?? 0 : 0)
      + (links.drivers ? r.queues.kyc_awaiting.now ?? 0 : 0);
  }, 0);
  const openAlerts = alerts.data?.open_count ?? null;

  const header = (
    <PageHeader
      title="Command Centre"
      subtitle={
        <>
          {longDate(new Date(), focusTz)}
          {scopeLabel(access) ? ` · ${scopeLabel(access)}` : ''}
          {' · '}
          {overview.status === 'loading' ? 'loading'
            : overview.status === 'ready'
              ? `${waiting} item${waiting === 1 ? '' : 's'} waiting on you`
              : 'figures unavailable'}
          {openAlerts !== null ? ` · ${openAlerts} open alert${openAlerts === 1 ? '' : 's'}` : ''}
          {overview.data?.cached ? ' · cached' : ''}
        </>
      }
    />
  );

  const barCities = cities.length ? cities : (city ? [{ code: city, name: city, status: 'active' }] : []);

  return (
    <>
      {header}

      {overview.status !== 'forbidden' && (
        <CityWindowBar
          cities={barCities}
          city={city}
          onCity={onCity}
          window={win}
          onWindow={onWindow}
          disabled={!hydrated}
        />
      )}

      {overview.status === 'forbidden' ? (
        <p className="ops-cc-note" role="note">The city figures are not part of your access.</p>
      ) : overview.status === 'loading' && !overview.data ? (
        <div aria-busy="true" aria-live="polite" data-testid="overview-loading">
          <span className="sr-only">Loading the figures</span>
          <div className="ops-cc-city__head"><Skeleton kind="text" width="10rem" /><Skeleton kind="text" width="14rem" /></div>
          <TileGrid><Skeleton kind="tile" count={12} /></TileGrid>
          <Skeleton kind="text" width="7rem" />
          <div className="ops-queues"><Skeleton kind="queue" count={3} /></div>
        </div>
      ) : overview.status === 'error' && !overview.data ? (
        <ErrorState
          title="The figures could not be loaded"
          detail={overview.error ?? undefined}
          onRetry={overview.reload}
        />
      ) : shown.length === 0 ? (
        <Empty
          title={rows.length === 0 ? 'No cities in your scope' : 'No data in this window'}
          detail={rows.length === 0
            ? 'Nothing is assigned to your account yet, or no city has data for this window.'
            : 'Choose another city or a wider window.'}
        />
      ) : (
        <div className="ops-cc-boards" aria-busy={overview.refreshing || undefined}>
          {overview.status === 'error' && overview.data ? (
            <p className="ops-cc-note" role="status">
              Showing the last figures that loaded; the latest attempt failed.{' '}
              <button type="button" className="sg-link" onClick={overview.reload}>Try again</button>
            </p>
          ) : null}
          {shown.map((row) => (
            <CityBoard key={row.code} row={row} access={access} single={shown.length === 1} />
          ))}
        </div>
      )}

      <FinanceTiles finance={overview.data?.finance} access={access} city={city} />

      <div className="ops-band ops-band--alerts">
        <AlertsPanel alerts={alerts} access={access} timeZones={timeZones} onChanged={overview.reload} />
      </div>

      <LiveTrips city={city} timeZone={focusTz} />
    </>
  );
}
