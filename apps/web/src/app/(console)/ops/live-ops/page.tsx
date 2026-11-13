'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { can, useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import {
  WINDOWS, buildQueue, canReadLive, canSeeAggregate, dotsInCity, filterQueue, kpiTotals, linkSentence,
  type QueueItem, type QueueKind, type QueueTab,
} from '@/lib/liveOps';
import { useSosAlarm } from '@/lib/useSosAlarm';
import { useHeatmap, useLiveOps } from '@/lib/useLiveOps';
import { AttentionQueue } from '@/components/console/liveops/AttentionQueue';
import { DetailPanel, type Detail } from '@/components/console/liveops/DetailPanel';
import { LiveLists, type ListTab } from '@/components/console/liveops/LiveLists';
import { LiveMap, type Follow, type Layers, type MapPick } from '@/components/console/liveops/LiveMap';
import { StatusBar, type ChipKey } from '@/components/console/liveops/StatusBar';
import { Empty, ErrorState, PageHeader, Skeleton } from '@/components/console/ui';

/**
 * Live map: where the drivers and trips are, and where demand is outrunning supply.
 *
 * Two levels of access, one page. `liveops.read` sees individual dots, trips and alerts;
 * `liveops.aggregate` sees only the short-of-drivers areas, small cells suppressed by the server.
 * Looking at where people are is recorded: opening this page writes an audit row, and the
 * notice below the map says so. This is what was asked for and available in the window just
 * gone, not a prediction, and nothing here sets a price.
 */
const COLLAPSE_KEY = 'lo-queue-collapsed';

const CHIP_LAYER: Record<ChipKey, keyof Layers> = {
  online: 'drivers', onTrip: 'drivers', waiting: 'trips', sos: 'alerts', stuck: 'trips', short: 'heatmap',
};
const CHIP_KIND: Partial<Record<ChipKey, QueueKind>> = { sos: 'sos', waiting: 'waiting', stuck: 'stale', short: 'short' };

type Sel = { kind: Detail['kind']; id: string };

export default function LiveOpsPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const full = canReadLive(access);
  const aggregate = canSeeAggregate(access);
  const may = full || aggregate;

  const [city, setCity] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [layers, setLayers] = useState<Layers>({ drivers: true, trips: true, alerts: true, heatmap: true });
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [tab, setTab] = useState<QueueTab>('all');
  const [collapsed, setCollapsed] = useState(false);
  const [listView, setListView] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [follow, setFollow] = useState<Follow | null>(null);
  const live = useLiveOps(city, may);
  const heat = useHeatmap(city, windowMinutes, may);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* storage may be blocked */ }
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    try { window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* storage may be blocked */ }
    return !c;
  });

  const snapshot = live.snapshot;
  const dots = useMemo(() => dotsInCity(live.dots, city), [live.dots, city]);
  const trips = useMemo(() => (snapshot?.trips ?? []).filter((t) => !city || t.city === city), [snapshot, city]);
  const alerts = useMemo(
    () => (snapshot?.alerts ?? []).filter((a) => !city || a.city === city || a.city === null), [snapshot, city],
  );
  const cells = useMemo(() => heat.data?.cells ?? [], [heat.data]);
  const focus = useMemo(() => (city ? [city] : live.cities
    .filter((c) => c.online_drivers + c.on_trip_drivers + c.unassigned_trips > 0).map((c) => c.code)), [city, live.cities]);

  useSosAlarm(alerts);

  const kpis = useMemo(() => kpiTotals(live.cities, alerts, cells), [live.cities, alerts, cells]);
  const queue = useMemo(() => buildQueue(alerts, trips, cells), [alerts, trips, cells]);
  const shown = useMemo(
    () => filterQueue(queue, tab, chip ? CHIP_KIND[chip] ?? null : null), [queue, tab, chip],
  );

  const canDrivers = canOpen(access, 'drivers');
  const canTrips = canOpen(access, 'trips');
  const driverHref = useCallback((id: number) => (canDrivers ? `/ops/drivers/${id}` : null), [canDrivers]);
  const tripHref = useCallback((id: number) => (canTrips ? `/ops/trips/${id}` : null), [canTrips]);

  const detail = useMemo<Detail | null>(() => {
    if (!sel) return null;
    if (sel.kind === 'alert') { const alert = alerts.find((a) => String(a.id) === sel.id); return alert ? { kind: 'alert', alert } : null; }
    if (sel.kind === 'trip') { const trip = trips.find((t) => String(t.id) === sel.id); return trip ? { kind: 'trip', trip } : null; }
    if (sel.kind === 'driver') { const dot = dots.find((d) => String(d.driver_id) === sel.id); return dot ? { kind: 'driver', dot } : null; }
    const cell = cells.find((c) => `${c.row}:${c.col}` === sel.id);
    return cell ? { kind: 'cell', cell } : null;
  }, [sel, alerts, trips, dots, cells]);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const openItem = (item: QueueItem) => {
    if (item.alert) setSel({ kind: 'alert', id: String(item.alert.id) });
    else if (item.trip) setSel({ kind: 'trip', id: String(item.trip.id) });
    else if (item.cell) setSel({ kind: 'cell', id: `${item.cell.row}:${item.cell.col}` });
  };
  const pick = useCallback((p: MapPick) => setSel({ kind: p.kind, id: String(p.id) }), []);
  const onChip = (key: ChipKey) => {
    setChip((c) => (c === key ? null : key));
    if (chip !== key) setLayers((l) => ({ ...l, [CHIP_LAYER[key]]: true }));
    setTab('all');
  };
  const selectedKey = sel && sel.kind !== 'driver' ? `${sel.kind === 'alert' ? 'a' : sel.kind === 'trip' ? 't' : 'c'}${sel.id}` : null;

  const mapLayers: Layers = full ? layers : { drivers: false, trips: false, alerts: false, heatmap: true };
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const listTabs: ListTab[] = full ? ['drivers', 'trips', 'alerts', 'cells'] : ['cells'];
  const queueTabs: QueueTab[] = full ? ['all', 'safety', 'trips', 'supply'] : ['all'];

  if (access && !may) {
    return (
      <>
        <PageHeader title="Live map" />
        <Empty title="Live Ops is not available to your role" detail="Ask a Super Admin if you need it." />
      </>
    );
  }
  if (!access || live.status === 'loading') {
    return (
      <>
        <PageHeader title="Live map" subtitle="Where drivers and trips are right now." />
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
        <PageHeader title="Live map" />
        <Empty title="Live Ops is not available to your role" detail="The server refused the request." error />
      </>
    );
  }
  if (live.status === 'error' && !snapshot) {
    return (
      <>
        <PageHeader title="Live map" />
        <ErrorState title="The live map could not be loaded" detail={live.error ?? undefined} onRetry={live.reload} />
      </>
    );
  }

  const linkText = live.link === 'live' && live.dataAge !== null
    ? `Live · ${Math.round(live.dataAge)} s ago` : linkSentence(live.link, live.dataAge);
  const linkClass = live.link === 'live' ? 'lo-link lo-link--live'
    : live.link === 'connecting' ? 'lo-link' : 'lo-link lo-link--down';
  const empty = (snapshot?.zones.length ?? 0) === 0 && dots.length === 0 && cells.length === 0;

  return (
    <div className="lo-ws">
      <header className="ops-list__head lo-strip">
        <h1>Live map</h1>
        <StatusBar kpis={kpis} full={full} active={chip} onChip={onChip} />
        {linkText ? <span className={linkClass} role="status">{linkText}</span> : null}
      </header>

      <div className="lo-stage">
        <AttentionQueue
          items={shown} total={queue.length} tab={tab} onTab={setTab} collapsed={collapsed} onToggle={toggleCollapsed}
          selectedKey={selectedKey} onOpen={openItem} now={now} windowMinutes={windowMinutes} tabs={queueTabs}
          footer={collapsed ? null : (
            <button type="button" className="lo-queue__list-btn" aria-expanded={listView} onClick={() => setListView((v) => !v)}>
              List view
            </button>
          )}
        />

        <div className="lo-canvas">
          {empty ? (
            <Empty title="Nothing to show yet" detail="No zone is configured in this scope, or nobody is online." />
          ) : (
            <LiveMap
              fill zones={snapshot?.zones ?? []} dots={dots} trips={trips} alerts={alerts} cells={cells}
              layers={mapLayers} driverHref={driverHref} windowMinutes={windowMinutes} focus={focus}
              onPick={full ? pick : undefined} follow={follow}
              caption={full ? 'Live map of drivers, active trips and alerts' : 'Map of demand and supply'}
            />
          )}

          <div className="lo-float">
            <label className="lo-field">
              <span className="sr-only">City</span>
              <select className="ops-select" aria-label="City" value={city ?? ''} onChange={(e) => setCity(e.target.value || null)}>
                <option value="">All cities in scope</option>
                {live.cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            {full ? (
              <fieldset className="lo-layers">
                <legend className="sr-only">Layers</legend>
                {([
                  ['drivers', 'Drivers'], ['trips', 'Trips'], ['alerts', 'Alerts'], ['heatmap', 'Demand gaps'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="lo-check">
                    <input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />
                    {label}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="lo-field">
              <span className="sr-only">Demand gaps window</span>
              <select
                className="ops-select" aria-label="Demand gaps window" value={windowMinutes}
                onChange={(e) => setWindowMinutes(Number(e.target.value))}
              >
                {WINDOWS.map((w) => <option key={w.minutes} value={w.minutes}>{w.label}</option>)}
              </select>
            </label>
          </div>

          <div className="lo-notes">
            <p className="lo-note">Opening this page is recorded in the audit log.</p>
            {live.error ? <p className="lo-note" role="status">{live.error}</p> : null}
            {snapshot && !snapshot.presence_available && full ? (
              <p className="lo-note lo-note--warn" role="status">
                Driver presence is unavailable right now, so the map may be missing drivers. Counts could be low.
              </p>
            ) : null}
            {snapshot?.truncated?.message ? <p className="lo-note lo-note--warn" role="status">{snapshot.truncated.message}</p> : null}
            {heat.data && heat.data.k_anonymity ? (
              <p className="lo-note" role="status">
                Areas with fewer than {heat.data.k_anonymity} events are not shown
                {heat.data.suppressed_cells ? ` (${heat.data.suppressed_cells} hidden)` : ''}.
              </p>
            ) : null}
            {heat.status === 'error' ? <p className="lo-note lo-note--warn" role="status">{heat.error}</p> : null}
          </div>

          <Legend full={full} heatmap={mapLayers.heatmap} />

          {detail ? (
            <DetailPanel
              key={`${detail.kind}:${sel?.id}`} detail={detail} now={now} windowMinutes={windowMinutes}
              canAck={can(access, 'safety.respond')} driverHref={driverHref} tripHref={tripHref}
              onClose={() => setSel(null)} onFollow={(lat, lng) => setFollow({ lat, lng, n: Date.now() })}
              onAcknowledged={live.reload}
            />
          ) : null}

          {listView ? (
            <section className="lo-listview" aria-label="List view">
              <div className="lo-listview__head">
                <b>List view</b>
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setListView(false)}>Close list</button>
              </div>
              <LiveLists
                tabs={listTabs} dots={dots} trips={trips} alerts={alerts} cells={cells} windowMinutes={windowMinutes}
                density={density} now={now} driverHref={driverHref} tripHref={tripHref}
              />
              <button type="button" className="lo-queue__list-btn" onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}>
                Density: {density}
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Legend({ full, heatmap }: { full: boolean; heatmap: boolean }) {
  return (
    <ul className="lo-legend lo-legend--float" aria-label="Map key">
      {full ? (
        <>
          <li><span className="lo-swatch lo-swatch--online" aria-hidden="true" />Online driver</li>
          <li><span className="lo-swatch lo-swatch--on_trip" aria-hidden="true" />Driver on a trip</li>
          <li><span className="lo-swatch lo-swatch--trip" aria-hidden="true" />Trip, pickup to drop</li>
          <li><span className="lo-swatch lo-swatch--alert" aria-hidden="true" />Alert</li>
        </>
      ) : null}
      {heatmap ? <li><span className="lo-swatch lo-swatch--short" aria-hidden="true" />Short of drivers</li> : null}
    </ul>
  );
}
