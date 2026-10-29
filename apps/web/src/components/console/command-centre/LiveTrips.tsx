'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import { clock, zoneAbbreviation } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
import {
  Column, DataTable, Empty, ErrorState, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * The strip of latest trips that the Command Centre has always carried.
 *
 * Narrowed to the selected city when one is chosen (the server intersects
 * `?scope=` with the operator's own scope) and timed in that city's clock.
 */
type Trip = {
  id: number;
  status?: string;
  status_id?: { status_code?: string };
  user?: string | null;
  driver_name?: string | null;
  pickup_address?: string;
  destination_address?: string;
  final_fare?: string | null;
  estimated_fare?: string | null;
  currency?: string | null;
  requested_at?: string;
};

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good',
  cancelled: 'bad',
  requested: 'wait',
  accepted: 'wait',
  reached: 'wait',
  in_progress: 'wait',
};

function fare(t: Trip) {
  const amount = t.final_fare ?? t.estimated_fare;
  if (amount === undefined || amount === null || amount === '') return '—';
  return `${currencySymbol(t.currency)}${amount}`;
}

export function LiveTrips({ city, timeZone }: { city: string | null; timeZone?: string }) {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [tick, setTick] = useState(0);
  const tzName = useMemo(() => zoneAbbreviation(timeZone), [timeZone]);

  useEffect(() => {
    let cancelled = false;
    const base = '/ride/admin/trips/?page_size=8';
    const path = city ? `${base}&scope=${encodeURIComponent(city)}` : withScope(base);
    api.get<{ results?: Trip[] }>(path).then((page) => {
      if (cancelled) return;
      setTrips(Array.isArray(page?.results) ? page.results : []);
      setError(null);
    }).catch((err: unknown) => {
      if (cancelled) return;
      if (err instanceof ApiError && err.status === 403) { setForbidden(true); return; }
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the latest trips.');
      setTrips(null);
    });
    return () => { cancelled = true; };
  }, [city, tick]);

  if (forbidden) {
    return <p className="ops-cc-note" role="note">Trips are not part of your access.</p>;
  }

  const columns: Column<Trip>[] = [
    { key: 'id', label: 'Trip', width: '5rem', render: (t) => <Link href={`/trips/${t.id}`}>#{t.id}</Link> },
    {
      key: 'status', label: 'Status', width: '8rem',
      render: (t) => {
        const state = t.status || t.status_id?.status_code || 'unknown';
        return <Pill tone={TONE[state] ?? 'neutral'}>{state.replace(/_/g, ' ')}</Pill>;
      },
    },
    { key: 'rider', label: 'Rider', width: '10rem', hideBelow: 1100, render: (t) => <span title={t.user ?? undefined}>{t.user || <span className="muted">—</span>}</span> },
    { key: 'driver', label: 'Driver', width: '11rem', hideBelow: 1280, render: (t) => <span title={t.driver_name ?? undefined}>{t.driver_name || <span className="muted">unassigned</span>}</span> },
    {
      key: 'route', label: 'Pickup → drop',
      render: (t) => (
        <span title={`${t.pickup_address ?? ''} → ${t.destination_address ?? ''}`}>
          {t.pickup_address || '—'} <span className="muted">→</span> {t.destination_address || '—'}
        </span>
      ),
    },
    { key: 'fare', label: 'Fare', num: true, width: '7rem', render: (t) => fare(t) },
    { key: 'time', label: tzName ? `Time (${tzName})` : 'Time', num: true, width: '7.5rem', render: (t) => clock(t.requested_at, timeZone) },
  ];

  return (
    <Panel
      title="Latest trips"
      action={<Link href={city ? `/trips?scope=${city}` : '/trips'} className="sg-link text-sm">All trips</Link>}
      flush
    >
      {error ? (
        <ErrorState title="Latest trips could not be loaded" detail={error} onRetry={() => setTick((t) => t + 1)} />
      ) : trips === null ? (
        <div className="ops-skel-rows" aria-busy="true">
          <span className="sr-only">Loading the latest trips</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : trips.length === 0 ? (
        <Empty title="No trips in this window" detail="Rides appear here as they are requested." />
      ) : (
        <DataTable
          caption="The most recent trips"
          rows={trips}
          columns={columns}
          rowKey={(t) => t.id}
          onRow={(t) => router.push(`/trips/${t.id}`)}
          density="compact"
          maxHeight={false}
        />
      )}
    </Panel>
  );
}
