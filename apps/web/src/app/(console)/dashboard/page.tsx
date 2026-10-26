'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { EMPTY_COUNTS, QueueCounts, fetchQueueCounts } from '@/lib/consoleQueues';
import {
  Empty,
  Hero,
  PageHeader,
  Panel,
  Pill,
  Queue,
  Stat,
  StatStrip,
  Table,
} from '@/components/console/ui';

/**
 * What an operator should do first, what they should know, and what is
 * happening right now.
 *
 * THE SECOND PASS. The first one fixed the ordering — work above metrics —
 * but left half a viewport of black below the fold, which is most of why
 * the console still read as a wireframe. A console with nothing under the
 * content looks unfinished however good the top is.
 *
 * So the page now has three bands, and they are in the order an operator
 * reads them:
 *
 *   1. TODAY'S MONEY, at a size that says it is the headline.
 *   2. WHAT IS WAITING, as queues that link to where the work is done.
 *   3. WHAT IS HAPPENING, a live list of the most recent trips — which is
 *      both the thing an operator glances at all day and the content that
 *      makes this a page rather than a header.
 */
type DashData = {
  date: string;
  trips: { requested: number; accepted: number; completed: number; cancelled: number; total: number };
  gmv: string | null;
  gmv_display?: string;
  drivers: { online_now: number; online_24h: number };
  riders: { active_24h: number };
  cancellations: { driver_24h: number };
  withdrawals: {
    pending: number;
    completed_today_amount: string | null;
    completed_today_display?: string;
  };
  receipts: { issued_today: number; send_failures_today: number };
};

type Trip = {
  id: number;
  status?: string;
  status_id?: { status_code?: string };
  pickup_address?: string;
  destination_address?: string;
  final_fare?: string;
  estimated_fare?: string;
  currency?: string | null;
  requested_at?: string;
};

/**
 * A fare with the currency the TRIP was priced in.
 *
 * Three money treatments on one screen -- a symbol in the hero, a bare
 * number in the strip, a bare number in the table -- is the detail that
 * makes a screen look unfinished. The trip stamps its own currency; this
 * uses it rather than choosing a symbol.
 */
function fare(t: Trip) {
  const amount = t.final_fare ?? t.estimated_fare;
  if (amount === undefined || amount === null || amount === '') return '—';
  return t.currency ? `${t.currency} ${amount}` : amount;
}

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good',
  cancelled: 'bad',
  requested: 'wait',
  accepted: 'wait',
  in_progress: 'wait',
};

const clock = (s?: string) => (s ? s.slice(11, 16) : '—');

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [counts, setCounts] = useState<QueueCounts>(EMPTY_COUNTS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.get<DashData>('/ride/admin/dashboard/'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load today’s figures.');
    } finally {
      setLoading(false);
    }

    // Shared with the sidebar. See lib/consoleQueues.ts: the endpoints
    // disagree about the case of their status values, and support returns
    // a confident 0 when it is wrong.
    setCounts(await fetchQueueCounts());

    try {
      const page = await api.get<{ results?: Trip[] }>('/ride/admin/trips/?page_size=8');
      setTrips(Array.isArray(page?.results) ? page.results : []);
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-ink-subtle">Loading…</p>;

  const waiting = [counts.sosOpen, counts.driversAwaiting, counts.withdrawalsPending,
    counts.supportOpen].reduce<number>((n, c) => n + (c ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={data?.date
          ? `${data.date} · ${waiting ? `${waiting} item${waiting === 1 ? '' : 's'} waiting on you` : 'nothing waiting'}`
          : undefined}
      />

      {error && <div className="alert-error mb-4" role="alert">{error}</div>}

      {/* ---- 1. the headline ------------------------------------------- */}
      <Hero
        label="Collected today"
        value={data ? (data.gmv_display || data.gmv) : null}
        note={data
          ? `${data.trips.completed} completed of ${data.trips.total} trips`
          : 'The queues below are fetched separately and may still be accurate.'}
        facts={data ? [
          { label: 'Online now', value: data.drivers.online_now },
          { label: 'Riders 24h', value: data.riders.active_24h },
          { label: 'Cancelled 24h', value: data.cancellations.driver_24h },
        ] : undefined}
      />

      {/* ---- 2. what is waiting ---------------------------------------- */}
      <section className="ops-queues mb-4">
        <Queue
          href="/sos" count={counts.sosOpen} urgent
          title="SOS alerts open"
          detail="A rider or driver has raised an alarm during a trip."
        />
        <Queue
          href="/drivers?approved=false" count={counts.driversAwaiting}
          title="Drivers awaiting review"
          detail="Documents uploaded, waiting on a decision."
        />
        <Queue
          href="/withdrawals" count={counts.withdrawalsPending}
          title="Withdrawals pending"
          detail="Drivers waiting to be paid out."
        />
        <Queue
          href="/support" count={counts.supportOpen}
          title="Support tickets open"
          detail="Riders and drivers waiting for an answer."
        />
      </section>

      {data && (
        <div className="mb-4">
          <StatStrip>
            <Stat label="Trips today" value={data.trips.total}
                  note={`${data.trips.requested} requested`} />
            <Stat label="Completed" value={data.trips.completed} />
            <Stat label="Drivers 24h" value={data.drivers.online_24h} />
            <Stat label="Paid out today" money
                  value={data.withdrawals.completed_today_display
                    || data.withdrawals.completed_today_amount} />
            <Stat label="Receipts" value={data.receipts.issued_today}
                  note={data.receipts.send_failures_today > 0
                    ? `${data.receipts.send_failures_today} failed`
                    : 'none failed'} />
          </StatStrip>
        </div>
      )}

      {/* Receipts that never reached anybody are a quiet failure: the trip
          looks finished and the rider has nothing. */}
      {data && data.receipts.send_failures_today > 0 && (
        <div className="alert-error mb-4" role="alert">
          {data.receipts.send_failures_today} receipt
          {data.receipts.send_failures_today === 1 ? '' : 's'} could not be sent
          today. Those riders have no record of their trip.
        </div>
      )}

      {/* ---- 3. what is happening -------------------------------------- */}
      <Panel
        title="Latest trips"
        action={<Link href="/trips" className="sg-link text-sm">All trips</Link>}
        flush
      >
        {trips === null ? (
          <Empty title="Loading…" />
        ) : trips.length === 0 ? (
          <Empty title="No trips yet today"
                 detail="Rides appear here as they are requested." />
        ) : (
          <Table head={<>
            <th>Trip</th><th>Status</th><th>Pickup</th><th>Drop</th>
            <th className="num">Fare</th><th className="num">Time</th>
          </>}>
            {trips.map((t) => {
              const state = t.status || t.status_id?.status_code || 'unknown';
              return (
                <tr key={t.id}>
                  <td><Link href={`/trips/${t.id}`}>#{t.id}</Link></td>
                  <td><Pill tone={TONE[state] ?? 'neutral'}>{state.replace(/_/g, ' ')}</Pill></td>
                  <td className="max-w-[18rem] truncate" title={t.pickup_address}>
                    {t.pickup_address || '—'}
                  </td>
                  <td className="max-w-[18rem] truncate" title={t.destination_address}>
                    {t.destination_address || '—'}
                  </td>
                  <td className="num">{fare(t)}</td>
                  <td className="num">{clock(t.requested_at)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}
