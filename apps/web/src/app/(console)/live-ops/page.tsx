'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import {
  WINDOWS, canReadLive, canSeeAggregate, dotsInCity, linkSentence,
} from '@/lib/liveOps';
import { useHeatmap, useLiveOps } from '@/lib/useLiveOps';
import { LiveLists, type ListTab } from '@/components/console/liveops/LiveLists';
import { LiveMap, type Layers } from '@/components/console/liveops/LiveMap';
import { StatusBar } from '@/components/console/liveops/StatusBar';
import {
  Empty, ErrorState, PageHeader, Panel, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Live Ops: where the drivers and trips are, and where demand is outrunning supply.
 *
 * TWO LEVELS OF ACCESS, ONE PAGE.
 *   `liveops.read`       individual driver dots, active trips and alert pins (City Ops, Safety,
 *                        Super Admin), for the cities the role is held in.
 *   `liveops.aggregate`  the Demand and supply heatmap only, with small cells suppressed by the
 *                        server (Analyst, Marketing). No dot, no trip, no alert is ever sent to
 *                        them, so there is nothing here to hide: the page just has fewer parts.
 *
 * Looking at where people are is itself recorded: opening this page writes an audit row for the
 * session. The page says so.
 *
 * This is NOT a prediction. "Demand and supply" is what was requested and what was available in
 * the window just gone. Nothing here sets a price.
 */
export default function LiveOpsPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const full = canReadLive(access);
  const aggregate = canSeeAggregate(access);
  const may = full || aggregate;

  const [city, setCity] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [layers, setLayers] = useState<Layers>({ drivers: true, trips: true, alerts: true, heatmap: false });
  const live = useLiveOps(city, may);
  const showHeat = full ? layers.heatmap : true;
  const heat = useHeatmap(city, windowMinutes, may && (showHeat || full));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const snapshot = live.snapshot;
  const dots = useMemo(() => dotsInCity(live.dots, city), [live.dots, city]);
  const trips = useMemo(() => (snapshot?.trips ?? []).filter((t) => !city || t.city === city), [snapshot, city]);
  const alerts = useMemo(
    () => (snapshot?.alerts ?? []).filter((a) => !city || a.city === city || a.city === null), [snapshot, city],
  );
  const cells = heat.data?.cells ?? [];
  // With every city showing, frame the ones that have something live (or all, if none does).
  const focus = useMemo(() => (city ? [city] : live.cities
    .filter((c) => c.online_drivers + c.on_trip_drivers + c.unassigned_trips > 0).map((c) => c.code)), [city, live.cities]);
  const cityOptions = live.cities;

  // The link rule: a dot goes to the driver's page only for a role that can open it.
  const canDrivers = canOpen(access, 'drivers');
  const canTrips = canOpen(access, 'trips');
  const driverHref = (id: number) => (canDrivers ? `/drivers/${id}` : null);
  const tripHref = (id: number) => (canTrips ? `/trips/${id}` : null);

  const tabs: ListTab[] = full ? ['drivers', 'trips', 'alerts', 'cells'] : ['cells'];
  const mapLayers: Layers = full ? layers : { drivers: false, trips: false, alerts: false, heatmap: true };
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  if (access && !may) {
    return (
      <>
        <PageHeader title="Live Ops" />
        <Empty title="Live Ops is not available to your role" detail="Ask a Super Admin if you need it." />
      </>
    );
  }
  if (!access || live.status === 'loading') {
    return (
      <>
        <PageHeader title="Live Ops" subtitle="Where drivers and trips are right now." />
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the live map</span>
          <Skeleton kind="block" count={2} />
        </div>
      </>
    );
  }
  if (live.status === 'forbidden') {
    return (
      <>
        <PageHeader title="Live Ops" />
        <Empty title="Live Ops is not available to your role" detail="The server refused the request." error />
      </>
    );
  }
  if (live.status === 'error' && !snapshot) {
    return (
      <>
        <PageHeader title="Live Ops" />
        <ErrorState title="The live map could not be loaded" detail={live.error ?? undefined} onRetry={live.reload} />
      </>
    );
  }

  const linkText = linkSentence(live.link, live.dataAge);
  const linkClass = live.link === 'live' ? 'lo-link lo-link--live'
    : live.link === 'connecting' ? 'lo-link' : 'lo-link lo-link--down';

  return (
    <>
      <PageHeader
        title="Live Ops"
        subtitle={full
          ? 'Where drivers and trips are right now, and where demand is outrunning supply. Opening this page is recorded.'
          : 'Where demand is outrunning supply. Your role sees counts per area, never an individual position.'}
        actions={linkText ? <span className={linkClass} role="status">{linkText}</span> : undefined}
      />

      <div className="grid gap-4">
        <StatusBar cities={cityOptions} selected={city} onSelect={setCity} />

        <Panel flush title="Map">
          <div className="lo-controls">
            <label className="lo-field">
              <span>City</span>
              <select
                className="ops-select" value={city ?? ''} onChange={(e) => setCity(e.target.value || null)}
              >
                <option value="">All cities in scope</option>
                {cityOptions.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>

            {full ? (
              <fieldset className="lo-layers">
                <legend>Layers</legend>
                {([
                  ['drivers', 'Drivers'], ['trips', 'Trips'], ['alerts', 'Alerts'], ['heatmap', 'Demand and supply'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="lo-check">
                    <input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />
                    {label}
                  </label>
                ))}
              </fieldset>
            ) : null}

            {showHeat ? (
              <label className="lo-field">
                <span>Demand and supply window</span>
                <select
                  className="ops-select" value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                >
                  {WINDOWS.map((w) => <option key={w.minutes} value={w.minutes}>{w.label}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          {live.error ? <p className="lo-note" role="status">{live.error}</p> : null}
          {snapshot && !snapshot.presence_available && full ? (
            <p className="lo-note lo-note--warn" role="status">
              Driver presence is unavailable right now, so the map may be missing drivers. Counts above could be low.
            </p>
          ) : null}
          {snapshot?.truncated?.message ? <p className="lo-note lo-note--warn" role="status">{snapshot.truncated.message}</p> : null}
          {showHeat && heat.data && heat.data.k_anonymity ? (
            <p className="lo-note" role="status">
              Areas with fewer than {heat.data.k_anonymity} events are not shown
              {heat.data.suppressed_cells ? ` (${heat.data.suppressed_cells} hidden)` : ''}.
            </p>
          ) : null}
          {showHeat && heat.status === 'error' ? <p className="lo-note lo-note--warn" role="status">{heat.error}</p> : null}

          {(snapshot?.zones.length ?? 0) === 0 && dots.length === 0 && cells.length === 0 ? (
            <Empty title="Nothing to show yet" detail="No zone is configured in this scope, or nobody is online." />
          ) : (
            <LiveMap
              zones={snapshot?.zones ?? []} dots={dots} trips={trips} alerts={alerts} cells={cells}
              layers={mapLayers} driverHref={driverHref} windowMinutes={windowMinutes} focus={focus}
              caption={full ? 'Live map of drivers, active trips and alerts' : 'Map of demand and supply'}
            />
          )}
          <Legend full={full} heatmap={showHeat} />
        </Panel>

        <Panel flush title="List view">
          <TableToolbar
            summary={full
              ? `${dots.length} driver${dots.length === 1 ? '' : 's'} · ${trips.length} active trip${trips.length === 1 ? '' : 's'} · ${alerts.length} alert${alerts.length === 1 ? '' : 's'}`
              : `${cells.length} area${cells.length === 1 ? '' : 's'}`}
            density={density} onDensity={setDensity}
          />
          <LiveLists
            tabs={tabs} dots={dots} trips={trips} alerts={alerts} cells={cells} windowMinutes={windowMinutes}
            density={density} now={now} driverHref={driverHref} tripHref={tripHref}
          />
        </Panel>
      </div>
    </>
  );
}

function Legend({ full, heatmap }: { full: boolean; heatmap: boolean }) {
  return (
    <ul className="lo-legend" aria-label="Map key">
      {full ? (
        <>
          <li><span className="lo-swatch lo-swatch--online" aria-hidden="true" />Online driver</li>
          <li><span className="lo-swatch lo-swatch--on_trip" aria-hidden="true" />Driver on a trip</li>
          <li><span className="lo-swatch lo-swatch--trip" aria-hidden="true" />Trip, pickup to drop</li>
          <li><span className="lo-swatch lo-swatch--alert" aria-hidden="true" />Alert</li>
        </>
      ) : null}
      {heatmap ? <li><span className="lo-swatch lo-swatch--short" aria-hidden="true" />Requests outnumber idle drivers</li> : null}
    </ul>
  );
}
