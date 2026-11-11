'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  STATUS_WORDS, SHADE_WORDS, TRIP_STATE_WORDS, ageText, positionText, secondsSince, shadeLevel,
  type Dot, type HeatCell, type LiveAlert, type LiveTrip,
} from '@/lib/liveOps';
import { Column, DataTable, Empty, Pill } from '@/components/console/ui';
import type { Density } from '@/lib/consolePrefs';

/**
 * The list view: everything on the map, as tables.
 *
 * THE MAP MUST NOT BE THE ONLY WAY TO READ THE DATA. Every driver, trip, alert and heat
 * cell drawn on the map is a row here, with the same words, reachable by keyboard
 * (a table row per item, sortable columns, Enter on a row's link). It is also the
 * better tool for "which driver is that": sort by age, find the one that went quiet.
 *
 * A row links to the driver's or trip's own page only when the signed-in role can open
 * that page (the link rule); otherwise the id is plain text. Those pages are scoped, so
 * a link that lands on a 404 is the server doing its job, not a bug here.
 */
export type ListTab = 'drivers' | 'trips' | 'alerts' | 'cells';

/** Rows drawn per table. The map has the rest, and the city picker narrows it. */
export const LIST_ROW_CAP = 500;

type Props = {
  tabs: ListTab[];
  dots: Dot[];
  trips: LiveTrip[];
  alerts: LiveAlert[];
  cells: HeatCell[];
  windowMinutes: number;
  density: Density;
  now: number;
  driverHref: (id: number) => string | null;
  tripHref: (id: number) => string | null;
};

const TAB_LABEL: Record<ListTab, string> = {
  drivers: 'Drivers', trips: 'Active trips', alerts: 'Alerts', cells: 'Demand and supply',
};

const STATUS_TONE = { online: 'good', on_trip: 'wait', offline: 'neutral' } as const;

function Capped({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return (
    <p className="lo-list__cap" role="status">
      Showing the first {shown.toLocaleString('en')} of {total.toLocaleString('en')}. Pick a city to narrow the list.
    </p>
  );
}

export function LiveLists(props: Props) {
  const { tabs, dots, trips, alerts, cells, windowMinutes, density, now, driverHref, tripHref } = props;
  const [picked, setPicked] = useState<ListTab>(tabs[0]);
  const tab = tabs.includes(picked) ? picked : tabs[0];
  const counts: Record<ListTab, number> = {
    drivers: dots.length, trips: trips.length, alerts: alerts.length, cells: cells.length,
  };

  return (
    <>
      <div className="ops-tabs" role="tablist" aria-label="What is on the map">
        {tabs.map((t) => (
          <button
            key={t} type="button" role="tab" id={`lo-tab-${t}`} className="ops-tab"
            aria-selected={tab === t} aria-controls="lo-list-panel" onClick={() => setPicked(t)}
          >
            {TAB_LABEL[t]}
            <span className="ops-tab__n" aria-label={`${counts[t]} ${TAB_LABEL[t].toLowerCase()}`}>{counts[t]}</span>
          </button>
        ))}
      </div>
      <div id="lo-list-panel" role="tabpanel" aria-labelledby={`lo-tab-${tab}`}>
        {tab === 'drivers' ? <DriverTable dots={dots} density={density} now={now} href={driverHref} /> : null}
        {tab === 'trips' ? <TripTable trips={trips} density={density} href={tripHref} /> : null}
        {tab === 'alerts' ? <AlertTable alerts={alerts} density={density} now={now} /> : null}
        {tab === 'cells' ? <CellTable cells={cells} windowMinutes={windowMinutes} density={density} /> : null}
      </div>
    </>
  );
}

function DriverTable({ dots, density, now, href }: { dots: Dot[]; density: Density; now: number; href: (id: number) => string | null }) {
  if (dots.length === 0) return <Empty title="No drivers on the map" detail="Nobody in this scope is online right now." />;
  const rows = dots.slice(0, LIST_ROW_CAP);
  const columns: Column<Dot>[] = [
    {
      key: 'id', label: 'Driver', width: '7rem', sortValue: (d) => d.driver_id,
      render: (d) => {
        const link = href(d.driver_id);
        return link ? <Link href={link} className="ops-linkbtn"><b>#{d.driver_id}</b></Link> : <b>#{d.driver_id}</b>;
      },
    },
    { key: 'status', label: 'Status', width: '9rem', sortValue: (d) => d.status, render: (d) => <Pill tone={STATUS_TONE[d.status]}>{STATUS_WORDS[d.status]}</Pill> },
    { key: 'vehicle', label: 'Vehicle', hideBelow: 1100, sortValue: (d) => d.vehicle_class ?? '', render: (d) => <span className="capitalize">{d.vehicle_class ?? '—'}</span> },
    { key: 'city', label: 'City', hideBelow: 1100, sortValue: (d) => d.city ?? '', render: (d) => d.city ?? '—' },
    { key: 'pos', label: 'Position', render: (d) => positionText(d.lat, d.lng, 4) },
    { key: 'trip', label: 'Trip', width: '6rem', num: true, sortValue: (d) => d.trip_id ?? 0, render: (d) => (d.trip_id ? `#${d.trip_id}` : '—') },
    {
      key: 'age', label: 'Updated', width: '7rem', num: true,
      sortValue: (d) => secondsSince(d.updated_at, now),
      render: (d) => ageText(secondsSince(d.updated_at, now)),
    },
  ];
  return (
    <>
      <DataTable
        caption="Drivers on the live map" density={density} maxHeight rows={rows}
        rowKey={(d) => d.driver_id} columns={columns} defaultSort={{ key: 'age', dir: 'desc' }}
      />
      <Capped shown={rows.length} total={dots.length} />
    </>
  );
}

function TripTable({ trips, density, href }: { trips: LiveTrip[]; density: Density; href: (id: number) => string | null }) {
  if (trips.length === 0) return <Empty title="No active trips" detail="Nothing is requested or under way in this scope." />;
  const rows = trips.slice(0, LIST_ROW_CAP);
  const columns: Column<LiveTrip>[] = [
    {
      key: 'id', label: 'Trip', width: '7rem', sortValue: (t) => t.id,
      render: (t) => {
        const link = href(t.id);
        return link ? <Link href={link} className="ops-linkbtn"><b>#{t.id}</b></Link> : <b>#{t.id}</b>;
      },
    },
    {
      key: 'state', label: 'State', width: '10rem', sortValue: (t) => t.state,
      render: (t) => (
        <>
          <Pill tone={t.state === 'requested' ? 'wait' : 'neutral'}>{TRIP_STATE_WORDS[t.state] ?? t.state}</Pill>
          {t.stale ? <> <Pill tone="bad">No recent signal</Pill></> : null}
        </>
      ),
    },
    { key: 'vehicle', label: 'Vehicle', hideBelow: 1100, sortValue: (t) => t.vehicle_class ?? '', render: (t) => <span className="capitalize">{t.vehicle_class ?? '—'}</span> },
    { key: 'city', label: 'City', hideBelow: 1100, sortValue: (t) => t.city ?? '', render: (t) => t.city ?? '—' },
    { key: 'pickup', label: 'Pickup (to ~100 m)', render: (t) => positionText(t.pickup_lat, t.pickup_lng, 3) },
    { key: 'drop', label: 'Drop (to ~100 m)', hideBelow: 1280, render: (t) => positionText(t.drop_lat, t.drop_lng, 3) },
    { key: 'age', label: 'Age', width: '7rem', num: true, sortValue: (t) => t.age_s, render: (t) => ageText(t.age_s) },
  ];
  return (
    <>
      <DataTable
        caption="Active trips" density={density} maxHeight rows={rows}
        rowKey={(t) => t.id} columns={columns} defaultSort={{ key: 'age', dir: 'desc' }}
      />
      <Capped shown={rows.length} total={trips.length} />
    </>
  );
}

function AlertTable({ alerts, density, now }: { alerts: LiveAlert[]; density: Density; now: number }) {
  if (alerts.length === 0) return <Empty title="No open alerts" detail="Nothing in this scope is waiting on a person." />;
  const columns: Column<LiveAlert>[] = [
    {
      key: 'sev', label: 'Severity', width: '8rem', sortValue: (a) => ({ critical: 0, warning: 1, info: 2 })[a.severity],
      render: (a) => <Pill tone={a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'wait' : 'neutral'}>{a.severity}</Pill>,
    },
    { key: 'title', label: 'Alert', render: (a) => <>{a.is_sos ? <b>SOS · </b> : null}{a.title}</> },
    { key: 'city', label: 'City', hideBelow: 1100, sortValue: (a) => a.city ?? '', render: (a) => a.city ?? 'Any city' },
    { key: 'where', label: 'On the map', hideBelow: 1100, render: (a) => (a.lat === null ? 'No position' : positionText(a.lat, a.lng, 3)) },
    { key: 'age', label: 'Raised', width: '7rem', num: true, sortValue: (a) => secondsSince(a.created_at, now), render: (a) => `${ageText(secondsSince(a.created_at, now))} ago` },
  ];
  return (
    <DataTable
      caption="Open alerts" density={density} maxHeight={false} rows={alerts}
      rowKey={(a) => a.id} columns={columns} defaultSort={{ key: 'sev', dir: 'asc' }}
    />
  );
}

function CellTable({ cells, windowMinutes, density }: { cells: HeatCell[]; windowMinutes: number; density: Density }) {
  if (cells.length === 0) {
    return <Empty title="No demand or supply in this window" detail={`Nothing was requested and no idle driver was seen in the last ${windowMinutes} minutes.`} />;
  }
  const rows = cells.slice(0, LIST_ROW_CAP);
  const columns: Column<HeatCell>[] = [
    { key: 'cell', label: 'Cell (about 1 km)', render: (c) => `${c.cell_south.toFixed(2)}, ${c.cell_west.toFixed(2)}`, sortValue: (c) => c.row * 100000 + c.col },
    { key: 'demand', label: 'Requests', num: true, width: '8rem', sortValue: (c) => c.demand, render: (c) => c.demand },
    { key: 'supply', label: 'Idle drivers (avg)', num: true, width: '10rem', sortValue: (c) => c.supply, render: (c) => c.supply.toFixed(1) },
    {
      key: 'shade', label: 'Balance', width: '9rem', sortValue: (c) => shadeLevel(c),
      render: (c) => <Pill tone={shadeLevel(c) ? 'bad' : 'good'}>{SHADE_WORDS[shadeLevel(c)]}</Pill>,
    },
  ];
  return (
    <>
      <DataTable
        caption={`Demand and supply by cell, last ${windowMinutes} minutes`} density={density} maxHeight rows={rows}
        rowKey={(c) => `${c.row}:${c.col}`} columns={columns} defaultSort={{ key: 'shade', dir: 'desc' }}
      />
      <Capped shown={rows.length} total={cells.length} />
    </>
  );
}
