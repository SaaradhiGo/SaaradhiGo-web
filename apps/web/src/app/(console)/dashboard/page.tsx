'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { EMPTY_COUNTS, QueueCounts, fetchQueueCounts } from '@/lib/consoleQueues';
import {
  AdminAccess, can, currentScope, getCachedAccess, scopeLabel, withScope,
} from '@/lib/adminScope';
import { clock, longDate, timeZoneFor, zoneAbbreviation } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
import {
  AlertRow,
  Column,
  DataTable,
  Empty,
  ErrorState,
  MetricTile,
  PageHeader,
  Panel,
  Pill,
  Skeleton,
  TileGrid,
} from '@/components/console/ui';

/**
 * The Command Centre: what is wrong, what is waiting, and what is happening.
 *
 * DENSE AND CALM. A grid of figures an operator can scan in a few seconds,
 * with the one thing that needs them raised in colour AND in words -- an
 * open SOS is red and says "SOS"; nothing else on the page is red. Gold is
 * spent on money and on nothing else here, so the eye learns what gold
 * means.
 *
 * Every figure follows the console's rule: a number nobody could load is
 * "Unavailable", never 0. The comparison with the same day last week is
 * drawn only when the server supplies it; today it does not, so no tile
 * carries a trend and none invents one.
 *
 * Times are shown in the selected region's own time zone, and the header
 * says which. A trip at "14:05" in Austin is not at 14:05 in Hyderabad.
 */
type DashData = {
  date: string;
  trips: { requested: number; accepted: number; completed: number; cancelled: number; total: number };
  gmv?: string | null;
  gmv_display?: string;
  drivers: { online_now: number; online_24h: number };
  riders: { active_24h: number };
  cancellations: { driver_24h: number };
  withdrawals?: {
    pending: number;
    completed_today_amount: string | null;
    completed_today_display?: string;
  };
  receipts: { issued_today: number; send_failures_today: number };
  /**
   * Not sent yet. When the server adds it, each tile's comparison appears
   * on its own; the keys mirror the figures above.
   */
  same_day_last_week?: Partial<{
    trips_total: number; completed: number; cancelled: number;
    gmv: string | number; online_now: number; riders_24h: number;
  }>;
};

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

function pct(now: number | null | undefined, then: number | string | null | undefined) {
  if (now === null || now === undefined || then === null || then === undefined) return null;
  const base = Number(then);
  if (!Number.isFinite(base) || base === 0) return null;
  return ((now - base) / base) * 100;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashData | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [counts, setCounts] = useState<QueueCounts>(EMPTY_COUNTS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AdminAccess | null>(null);

  useEffect(() => setAccess(getCachedAccess()), []);

  const scope = currentScope(access);
  const tz = timeZoneFor(scope?.code);
  const tzName = useMemo(() => zoneAbbreviation(tz), [tz]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<DashData>(withScope('/ride/admin/dashboard/')));
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
    setCounts(await fetchQueueCounts(getCachedAccess()));

    try {
      const page = await api.get<{ results?: Trip[] }>(withScope('/ride/admin/trips/?page_size=8'));
      setTrips(Array.isArray(page?.results) ? page.results : []);
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const waiting = [counts.sosOpen, counts.driversAwaiting, counts.withdrawalsPending,
    counts.supportOpen].reduce<number>((n, c) => n + (c ?? 0), 0);

  const money = data ? 'gmv' in data || 'gmv_display' in data : false;
  const lw = data?.same_day_last_week;
  const where = scopeLabel(access);

  const columns: Column<Trip>[] = [
    { key: 'id', label: 'Trip', width: '6rem', render: (t) => <Link href={`/trips/${t.id}`}>#{t.id}</Link> },
    {
      key: 'status', label: 'Status', width: '9rem',
      render: (t) => {
        const state = t.status || t.status_id?.status_code || 'unknown';
        return <Pill tone={TONE[state] ?? 'neutral'}>{state.replace(/_/g, ' ')}</Pill>;
      },
    },
    { key: 'rider', label: 'Rider', hideBelow: 1100, render: (t) => t.user || <span className="muted">—</span> },
    { key: 'driver', label: 'Driver', hideBelow: 1280, render: (t) => t.driver_name || <span className="muted">unassigned</span> },
    {
      key: 'route', label: 'Pickup → drop',
      render: (t) => (
        <span className="truncate block max-w-[26rem]" title={`${t.pickup_address ?? ''} → ${t.destination_address ?? ''}`}>
          {t.pickup_address || '—'} <span className="muted">→</span> {t.destination_address || '—'}
        </span>
      ),
    },
    { key: 'fare', label: 'Fare', num: true, width: '7rem', render: (t) => fare(t) },
    { key: 'time', label: tzName ? `Time (${tzName})` : 'Time', num: true, width: '7rem', render: (t) => clock(t.requested_at, tz) },
  ];

  const header = (
    <PageHeader
      title="Command Centre"
      subtitle={
        <>
          {longDate(new Date(), tz)}
          {where ? ` · ${where}` : ''}
          {/* A region has a clock; the whole platform does not, so a
              global view says plainly that the times are the viewer's. */}
          {tzName ? (tz ? ` · times in ${tzName}` : ` · times in your local ${tzName}`) : ''}
          {' · '}
          {loading ? 'loading' : waiting
            ? `${waiting} item${waiting === 1 ? '' : 's'} waiting on you`
            : 'nothing waiting'}
        </>
      }
    />
  );

  if (loading && !data) {
    return (
      <>
        {header}
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading today’s figures</span>
          <TileGrid><Skeleton kind="tile" count={8} /></TileGrid>
          <div className="ops-band">
            <Skeleton kind="block" />
            <Skeleton kind="block" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}

      {error && !data && (
        <div className="mb-4">
          <ErrorState
            title="Today’s figures could not be loaded"
            detail={error}
            onRetry={() => void load()}
          />
        </div>
      )}

      {/* ---- the figures ------------------------------------------------ */}
      <TileGrid>
        {money && (
          <MetricTile
            label="Collected today" tone="money"
            value={data?.gmv_display || data?.gmv}
            delta={{ pct: pct(data?.gmv ? Number(data.gmv) : null, lw?.gmv) }}
            note={data ? `${data.trips.completed} completed trip${data.trips.completed === 1 ? '' : 's'}` : undefined}
            href="/trips?status=completed"
          />
        )}
        <MetricTile
          label="Trips today" value={data?.trips.total}
          delta={{ pct: pct(data?.trips.total, lw?.trips_total) }}
          note={data ? `${data.trips.requested} requested · ${data.trips.accepted} accepted` : undefined}
          href="/trips"
        />
        <MetricTile
          label="Completed" value={data?.trips.completed} tone="good"
          delta={{ pct: pct(data?.trips.completed, lw?.completed) }}
          href="/trips?status=completed"
        />
        <MetricTile
          label="Cancelled" value={data?.trips.cancelled}
          tone={data && data.cancellations.driver_24h > 0 ? 'wait' : 'neutral'}
          delta={{ pct: pct(data?.trips.cancelled, lw?.cancelled) }}
          note={data ? `${data.cancellations.driver_24h} by drivers in 24h` : undefined}
          href="/trips?status=cancelled"
        />
        <MetricTile
          label="Drivers online" value={data?.drivers.online_now}
          delta={{ pct: pct(data?.drivers.online_now, lw?.online_now) }}
          note={data ? `${data.drivers.online_24h} were online in 24h` : undefined}
          href="/drivers?status=online"
        />
        <MetricTile
          label="Riders active" value={data?.riders.active_24h} unit="24h"
          delta={{ pct: pct(data?.riders.active_24h, lw?.riders_24h) }}
        />
        {money && data?.withdrawals && (
          <MetricTile
            label="Paid out today" tone="money"
            value={data.withdrawals.completed_today_display || data.withdrawals.completed_today_amount}
            note={`${data.withdrawals.pending} pending`}
            href="/withdrawals"
          />
        )}
        <MetricTile
          label="Receipts" value={data?.receipts.issued_today}
          tone={data && data.receipts.send_failures_today > 0 ? 'urgent' : 'neutral'}
          note={data
            ? (data.receipts.send_failures_today > 0
              ? `${data.receipts.send_failures_today} failed to send`
              : 'none failed')
            : undefined}
        />
      </TileGrid>

      {/* ---- the queues: only the ones this role can act on ------------- */}
      <TileGrid>
        {can(access, 'safety.respond') && (
          <MetricTile
            label="SOS open" value={counts.sosOpen}
            tone={(counts.sosOpen ?? 0) > 0 ? 'urgent' : 'neutral'}
            note={(counts.sosOpen ?? 0) > 0 ? 'Needs someone now' : 'None open'}
            href="/sos"
          />
        )}
        {can(access, 'driver.read') && (
          <MetricTile
            label="Awaiting review" value={counts.driversAwaiting}
            tone={(counts.driversAwaiting ?? 0) > 0 ? 'wait' : 'neutral'}
            note="Drivers with documents to check"
            href="/drivers?approved=false"
          />
        )}
        {can(access, 'finance.read') && (
          <MetricTile
            label="Withdrawals pending" value={counts.withdrawalsPending}
            tone={(counts.withdrawalsPending ?? 0) > 0 ? 'wait' : 'neutral'}
            note="Drivers waiting to be paid"
            href="/withdrawals"
          />
        )}
        {can(access, 'support.read') && (
          <MetricTile
            label="Support open" value={counts.supportOpen}
            tone={(counts.supportOpen ?? 0) > 0 ? 'wait' : 'neutral'}
            note="Tickets without an answer"
            href="/support"
          />
        )}
      </TileGrid>

      {/* ---- what needs attention, and where to go ---------------------- */}
      <div className="ops-band">
        <Panel title="Needs attention" flush>
          <div className="ops-alerts">
            {(counts.sosOpen ?? 0) > 0 && (
              <AlertRow tone="urgent" word="SOS" href="/sos">
                {counts.sosOpen} alert{counts.sosOpen === 1 ? '' : 's'} open — a rider or driver has raised an alarm.
              </AlertRow>
            )}
            {data && data.receipts.send_failures_today > 0 && (
              <AlertRow tone="urgent" word="Receipts" href="/trips?status=completed">
                {data.receipts.send_failures_today} receipt{data.receipts.send_failures_today === 1 ? '' : 's'} could not be sent today. Those riders have no record of their trip.
              </AlertRow>
            )}
            {(counts.driversAwaiting ?? 0) > 0 && (
              <AlertRow tone="wait" word="Review" href="/drivers?approved=false">
                {counts.driversAwaiting} driver{counts.driversAwaiting === 1 ? '' : 's'} waiting on a decision.
              </AlertRow>
            )}
            {(counts.withdrawalsPending ?? 0) > 0 && (
              <AlertRow tone="wait" word="Payout" href="/withdrawals">
                {counts.withdrawalsPending} withdrawal{counts.withdrawalsPending === 1 ? '' : 's'} pending.
              </AlertRow>
            )}
            {(counts.supportOpen ?? 0) > 0 && (
              <AlertRow tone="wait" word="Support" href="/support">
                {counts.supportOpen} ticket{counts.supportOpen === 1 ? '' : 's'} open.
              </AlertRow>
            )}
            {data && data.cancellations.driver_24h > 0 && (
              <AlertRow tone="neutral" word="Cancels" href="/trips?status=cancelled">
                {data.cancellations.driver_24h} trip{data.cancellations.driver_24h === 1 ? '' : 's'} cancelled by drivers in the last 24 hours.
              </AlertRow>
            )}
            {!((counts.sosOpen ?? 0) || (counts.driversAwaiting ?? 0) || (counts.withdrawalsPending ?? 0)
              || (counts.supportOpen ?? 0) || (data?.receipts.send_failures_today ?? 0)
              || (data?.cancellations.driver_24h ?? 0)) && (
              <AlertRow tone="good" word="Clear">Nothing needs attention right now.</AlertRow>
            )}
          </div>
        </Panel>

        <Panel title="Go to" flush>
          <nav className="ops-quick" aria-label="Filtered lists">
            <Link href="/trips?status=in_progress"><span>Trips</span>in progress now</Link>
            <Link href="/trips?status=requested"><span>Trips</span>waiting for a driver</Link>
            <Link href="/trips?status=cancelled"><span>Trips</span>cancelled today</Link>
            {can(access, 'driver.read') && (
              <Link href="/drivers?approved=false"><span>Drivers</span>awaiting review
                {typeof counts.driversAwaiting === 'number' ? <b>{counts.driversAwaiting}</b> : null}
              </Link>
            )}
            {can(access, 'driver.read') && (
              <Link href="/drivers?status=online"><span>Drivers</span>online now</Link>
            )}
            {can(access, 'finance.read') && (
              <Link href="/withdrawals"><span>Money</span>withdrawals pending
                {typeof counts.withdrawalsPending === 'number' ? <b>{counts.withdrawalsPending}</b> : null}
              </Link>
            )}
          </nav>
        </Panel>
      </div>

      {/* ---- what is happening ------------------------------------------ */}
      <Panel
        title="Latest trips"
        action={<Link href="/trips" className="sg-link text-sm">All trips</Link>}
        flush
      >
        {trips === null ? (
          <div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={5} /></div>
        ) : trips.length === 0 ? (
          <Empty title="No trips yet today" detail="Rides appear here as they are requested." />
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
    </>
  );
}
