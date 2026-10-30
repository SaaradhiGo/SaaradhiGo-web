'use client';

import { ReactNode } from 'react';
import {
  CityRow, Delta, Pair, delta, formatCount, formatDelta, formatMinutes, formatRate, moneyTiles,
} from '@/lib/commandCentre';
import { AdminAccess, can } from '@/lib/adminScope';
import { clock, zoneAbbreviation } from '@/lib/consoleTime';
import { MetricTile, Queue, TileGrid } from '@/components/console/ui';

/**
 * One city's board: its figures, its money, and what is waiting on a person.
 *
 * Every tile carries the number, and -- when the server sent a last-week
 * counterpart -- the movement since the same window a week ago. Money is
 * one tile PER CURRENCY (`moneyTiles`), so a board that somehow collected
 * rupees and dollars shows two tiles and never one sum. Numbers are in the
 * country's locale (lakh grouping in India), and the heading shows the
 * city's own clock.
 *
 * A figure of null (a rate with nothing to divide by) renders as
 * "Unavailable" with the reason beneath it, never as 0.
 */
const WINDOW_LABEL: Record<string, string> = {
  today: 'vs same time last week',
  '24h': 'vs same 24 h last week',
  '7d': 'vs previous 7 d',
};

function tileDelta(d: Delta | null, country: string, windowKey: string) {
  if (!d) return null;
  // MetricTile draws the arrow from the sign of `pct`; the magnitude is
  // given as text so a rate's delta reads in points ("5.0 pp"), not as a
  // percentage of a percentage.
  const text = formatDelta(d, country)?.slice(2) ?? undefined;
  return { pct: d.value, text, label: WINDOW_LABEL[windowKey] ?? 'vs last week' };
}

function countTile(
  label: string, pair: Pair, country: string, windowKey: string,
  opts: { direction?: 'up' | 'down' | 'none'; tone?: 'neutral' | 'good' | 'wait' | 'urgent' | 'money'; note?: ReactNode; href?: string } = {},
) {
  const d = delta(pair.now, pair.last_week, 'count', opts.direction ?? 'none');
  return (
    <MetricTile
      key={label}
      label={label}
      value={formatCount(pair.now, country)}
      tone={opts.tone ?? 'neutral'}
      delta={tileDelta(d, country, windowKey)}
      note={opts.note}
      href={opts.href}
    />
  );
}

/** The capabilities behind the "Waiting on you" queues below (live SOS goes
 *  to safety.respond and City Ops' trip.write; the server sends it or not). */
const QUEUE_CAPABILITIES = ['safety.respond', 'trip.write', 'finance.read', 'support.read', 'driver.read'];

export function CityBoard({
  row,
  access,
  single,
}: {
  row: CityRow;
  access: AdminAccess | null;
  /** True when this is the only board on the page: the heading is lighter. */
  single: boolean;
}) {
  const country = row.country;
  const tz = row.timezone;
  const w = row.window.key;
  const requested = row.trips.requested.now ?? 0;
  const noRequests = requested === 0;
  const emptyNote = 'No requests in this window';

  const unfulfilled = delta(row.rates.unfulfilled_rate.now, row.rates.unfulfilled_rate.last_week, 'rate', 'down');
  const acceptance = delta(row.rates.acceptance_rate.now, row.rates.acceptance_rate.last_week, 'rate', 'up');
  const eta = delta(row.rates.avg_eta_minutes.now, row.rates.avg_eta_minutes.last_week, 'rate', 'down');

  const collected = row.money ? moneyTiles(row.money.collected, 'Collected', 'up') : [];
  const pendingSums = row.money ? moneyTiles(row.money.withdrawals_pending_sum, 'Payouts pending', 'none') : [];

  const sosOpen = row.queues.sos_open?.now ?? 0;
  const q = row.queues;

  return (
    <section className="ops-cc-city" aria-labelledby={`city-${row.code}`}>
      <header className={`ops-cc-city__head ${single ? 'ops-cc-city__head--single' : ''}`}>
        <h2 id={`city-${row.code}`}>
          {row.name}
          {row.status !== 'active' ? <span className="ops-pill">{row.status}</span> : null}
        </h2>
        <p>
          <span className="sg-num">{clock(row.window.end, tz)}</span>
          {' '}{zoneAbbreviation(tz)} local
          {' · '}{row.currency}
          {' · '}{row.drivers.online_source === 'presence' ? 'presence live' : 'presence from status'}
        </p>
      </header>

      <TileGrid>
        {countTile('Requested', row.trips.requested, country, w, {
          href: `/trips?scope=${row.code}`, note: noRequests ? emptyNote : undefined,
        })}
        {countTile('Accepted', row.trips.accepted, country, w, { direction: 'up' })}
        {countTile('Completed', row.trips.completed, country, w, {
          direction: 'up', tone: 'good', href: `/trips?status=completed&scope=${row.code}`,
        })}
        {countTile('Cancelled', row.trips.cancelled, country, w, {
          direction: 'down', href: `/trips?status=cancelled&scope=${row.code}`,
        })}
        {countTile('Unfulfilled', row.trips.unfulfilled, country, w, {
          direction: 'down', note: 'No driver ever accepted',
        })}
        <MetricTile
          label="Unfulfilled rate"
          value={formatRate(row.rates.unfulfilled_rate.now, country)}
          tone={(row.rates.unfulfilled_rate.now ?? 0) > 15 ? 'wait' : 'neutral'}
          delta={tileDelta(unfulfilled, country, w)}
          note={row.rates.unfulfilled_rate.now === null ? emptyNote : 'of requests, no driver accepted'}
        />
        <MetricTile
          label="Acceptance rate"
          value={formatRate(row.rates.acceptance_rate.now, country)}
          tone={(row.rates.acceptance_rate.now ?? 100) < 70 ? 'wait' : 'neutral'}
          delta={tileDelta(acceptance, country, w)}
          note={row.rates.acceptance_rate.now === null ? emptyNote : 'accepted ÷ requested (offers are not recorded)'}
        />
        <MetricTile
          label="Average ETA"
          value={formatMinutes(row.rates.avg_eta_minutes.now, country)}
          tone={(row.rates.avg_eta_minutes.now ?? 0) > 8 ? 'wait' : 'neutral'}
          delta={tileDelta(eta, country, w)}
          note={row.rates.avg_eta_minutes.now === null ? 'No arrivals in this window' : 'accept → arrive'}
        />
        <MetricTile
          label="Drivers online"
          value={formatCount(row.drivers.online_now.now, country)}
          note={`${formatCount(row.drivers.active.now, country) ?? '—'} active in window`}
          href={`/drivers?status=online&scope=${row.code}`}
        />
        {countTile('Riders active', row.riders.active_24h, country, w, {
          direction: 'up', note: 'last 24 h',
        })}
        {collected.map((t) => (
          <MetricTile
            key={t.currency}
            label={t.label}
            value={t.value}
            tone="money"
            delta={tileDelta(t.delta, country, w)}
            note={`${formatCount(row.trips.completed.now, country) ?? '—'} completed trips`}
            href={`/trips?status=completed&scope=${row.code}`}
          />
        ))}
        {row.money && collected.length === 0 ? (
          <MetricTile label={`Collected (${row.currency})`} value={formatCount(0, country)} tone="money" note={emptyNote} />
        ) : null}
        {pendingSums.map((t) => (
          <MetricTile key={`pending-${t.currency}`} label={t.label} value={t.value} tone="money"
            note={`${formatCount(q.withdrawals_pending?.now ?? 0, country)} waiting`} href="/withdrawals" />
        ))}
      </TileGrid>

      <h3 className="ops-subhead">Waiting on you</h3>
      {!QUEUE_CAPABILITIES.some((c) => can(access, c)) && (
        <p className="ops-cc-note" role="note">No work queues are part of your access.</p>
      )}
      <div className="ops-queues">
        {q.sos_open && (
          <Queue
            count={sosOpen}
            title="SOS open"
            detail={sosOpen > 0
              ? `Oldest ${formatMinutes(q.sos_oldest_open_minutes, country)} unacknowledged`
              : 'None open'}
            href={`/sos?scope=${row.code}`}
            urgent
          />
        )}
        {can(access, 'finance.read') && q.withdrawals_pending && (
          <Queue
            count={q.withdrawals_pending.now}
            title="Withdrawals pending"
            detail={(q.withdrawals_pending.now ?? 0) > 0
              ? `Oldest waiting ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(q.withdrawals_oldest_pending_hours ?? 0)} h`
              : 'Nobody waiting to be paid'}
            href={`/withdrawals?scope=${row.code}`}
          />
        )}
        {can(access, 'support.read') && (
          <Queue
            count={q.tickets_open.now}
            title="Tickets open"
            detail={`${formatCount(q.tickets_raised.now, country) ?? '—'} raised in window`}
            href={`/support?scope=${row.code}`}
          />
        )}
        {can(access, 'driver.read') && (
          <Queue
            count={q.kyc_awaiting.now}
            title="KYC awaiting review"
            detail="Drivers with documents to check"
            href={`/drivers?approved=false&scope=${row.code}`}
          />
        )}
      </div>
    </section>
  );
}
