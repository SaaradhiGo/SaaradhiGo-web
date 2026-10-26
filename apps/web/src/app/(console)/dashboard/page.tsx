'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  Empty,
  PageHeader,
  Panel,
  Queue,
  Stat,
  StatStrip,
} from '@/components/console/ui';

/**
 * What an operator should do first, and then what they should know.
 *
 * IT USED TO BE SEVEN IDENTICAL BOXES above two thirds of empty black.
 * "TRIPS TOTAL 3" carried the same weight as the money beside it, nothing
 * was clickable, and nothing said what needed doing — which is the only
 * question somebody opening an operations console actually has.
 *
 * Queues first, because they are work. Metrics second and quieter, because
 * they are context. Every queue is a link to the screen where that work is
 * done.
 *
 * ON THE MONEY FIGURE
 * The server returns `gmv_display`, already formatted per currency, and
 * `gmv` which is deliberately NULL when the day spans more than one market
 * — adding rupees to dollars would be a lie. This page used to render
 * `Rs ${data.gmv}`, which hardcoded one symbol and would have printed
 * "Rs null" the day a second market opened. It reads `gmv_display`.
 */
type DashData = {
  date: string;
  trips: { requested: number; accepted: number; completed: number; cancelled: number; total: number };
  gmv: string | null;
  gmv_display?: string;
  gmv_by_currency?: Record<string, string>;
  drivers: { online_now: number; online_24h: number };
  riders: { active_24h: number };
  cancellations: { driver_24h: number };
  withdrawals: { pending: number; completed_today_amount: string };
  receipts: { issued_today: number; send_failures_today: number };
};

type Counts = {
  driversAwaiting: number | null;
  withdrawalsPending: number | null;
  supportOpen: number | null;
  sosOpen: number | null;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // null means "we could not find out", which is never shown as zero.
  const [counts, setCounts] = useState<Counts>({
    driversAwaiting: null,
    withdrawalsPending: null,
    supportOpen: null,
    sosOpen: null,
  });

  const load = useCallback(async () => {
    try {
      setData(await api.get<DashData>('/ride/admin/dashboard/'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the dashboard.');
    } finally {
      setLoading(false);
    }

    // Each queue count is independent: one failing must not blank the
    // others, and a failure leaves that count unknown rather than zero.
    const count = async (path: string) => {
      try {
        const page = await api.get<{ count?: number }>(path);
        return typeof page?.count === 'number' ? page.count : null;
      } catch {
        return null;
      }
    };

    const [driversAwaiting, withdrawalsPending, supportOpen, sosOpen] = await Promise.all([
      count('/driver/admin/?approved=false&page_size=1'),
      count('/driver/admin/withdrawals/?status=pending&page_size=1'),
      count('/support/admin/tickets/?status=open&page_size=1'),
      count('/sos/admin/?status=open&page_size=1'),
    ]);
    setCounts({ driversAwaiting, withdrawalsPending, supportOpen, sosOpen });
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
          ? `${data.date}${waiting ? ` · ${waiting} item${waiting === 1 ? '' : 's'} waiting on you` : ' · nothing waiting'}`
          : undefined}
      />

      {error && (
        <div className="alert-error mb-5" role="alert">{error}</div>
      )}

      {/* ---- what to do -------------------------------------------------- */}
      <section className="ops-queues mb-6">
        <Queue
          href="/sos"
          count={counts.sosOpen}
          urgent
          title="SOS alerts open"
          detail="A rider or driver has raised an alarm during a trip."
        />
        <Queue
          href="/drivers?approved=false"
          count={counts.driversAwaiting}
          title="Drivers awaiting review"
          detail="Documents uploaded and waiting on a decision before they can be dispatched."
        />
        <Queue
          href="/withdrawals"
          count={counts.withdrawalsPending}
          title="Withdrawals pending"
          detail="Drivers waiting to be paid out."
        />
        <Queue
          href="/support"
          count={counts.supportOpen}
          title="Support tickets open"
          detail="Riders and drivers waiting for an answer."
        />
      </section>

      {/* ---- what to know ------------------------------------------------ */}
      {data ? (
        <>
          <StatStrip>
            <Stat
              label="Collected today"
              money
              value={data.gmv_display || (data.gmv ?? null)}
              note={`${data.trips.completed} completed`}
            />
            <Stat label="Trips today" value={data.trips.total}
                  note={`${data.trips.requested} requested`} />
            <Stat label="Cancelled 24h" value={data.cancellations.driver_24h}
                  note="by drivers" />
            <Stat label="Drivers online" value={data.drivers.online_now}
                  note={`${data.drivers.online_24h} in 24h`} />
            <Stat label="Riders 24h" value={data.riders.active_24h} />
            <Stat label="Receipts today" value={data.receipts.issued_today}
                  note={data.receipts.send_failures_today > 0
                    ? `${data.receipts.send_failures_today} failed to send`
                    : 'none failed'} />
          </StatStrip>

          {/* Receipts that never reached anybody are a quiet failure: the
              trip looks finished and the rider has nothing. */}
          {data.receipts.send_failures_today > 0 && (
            <div className="alert-error mt-5" role="alert">
              {data.receipts.send_failures_today} receipt
              {data.receipts.send_failures_today === 1 ? '' : 's'} could not be
              sent today. Those riders have no record of their trip.
            </div>
          )}
        </>
      ) : (
        <Panel>
          <Empty
            error
            title="Today's figures are unavailable"
            detail="The queues above are fetched separately and may still be accurate."
          />
        </Panel>
      )}
    </>
  );
}
