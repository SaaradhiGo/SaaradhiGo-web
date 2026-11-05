'use client';

import { ReactNode } from 'react';
import {
  CityRow, Delta, Pair, delta, formatAge, formatCount, formatDelta, formatMinutes, formatRate, moneyTiles,
} from '@/lib/commandCentre';
import type { AdminAccess } from '@/lib/adminScope';
import { boardLinks } from '@/lib/boardLinks';
import { clock, zoneAbbreviation } from '@/lib/consoleTime';
import { canOpen } from '@/lib/consoleLinks';
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

const NOT_ENOUGH = 'Not enough data yet';
const MIN_REQUESTS_FOR_RATE = 20;
const MIN_ARRIVALS_FOR_ETA = 5;

export function CityBoard({
  row,
  access,
  single,
  approvalsWaiting,
}: {
  row: CityRow;
  access: AdminAccess | null;
  /** True when this is the only board on the page: the heading is lighter. */
  single: boolean;
  /** Requests waiting for this operator to check (not per city); undefined hides the tile. */
  approvalsWaiting?: number | null;
}) {
  const country = row.country;
  const tz = row.timezone;
  // THE LINK RULE: a tile, queue or count is drawn as a link only if this
  // operator can open the page behind it, at this city. A figure whose page
  // is closed to them stays a plain figure.
  const links = boardLinks(access, row.code);
  const to = (allowed: boolean, href: string) => (allowed ? href : undefined);
  const w = row.window.key;
  const requested = row.trips.requested.now ?? 0;
  const noRequests = requested === 0;
  const emptyNote = 'No requests in this window';
  // A rate over a handful of requests, or an average over one or two arrivals,
  // reads as a fact and is not one (owner, 2026-11-03: "0.2 min" was shown).
  const thin = requested > 0 && requested < MIN_REQUESTS_FOR_RATE;
  const fewArrivals = (row.trips.accepted.now ?? 0) < MIN_ARRIVALS_FOR_ETA
    && row.rates.avg_eta_minutes.now !== null;

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
        </p>
      </header>

      <TileGrid variant="lead">
        {q.sos_open && links.safety ? (
          <MetricTile label="Open SOS" tone={sosOpen > 0 ? 'urgent' : 'neutral'} value={formatCount(sosOpen, country)}
            note={sosOpen > 0 ? `Oldest ${formatAge(q.sos_oldest_open_minutes)} unacknowledged` : 'None open'}
            href={`/safety-ops?scope=${row.code}`} />
        ) : null}
        {approvalsWaiting !== undefined && canOpen(access, 'approvals') ? (
          <MetricTile label="Approvals waiting for you" tone={approvalsWaiting ? 'wait' : 'neutral'}
            value={approvalsWaiting === null ? null : formatCount(approvalsWaiting, country)}
            note="All places" href="/approvals" />
        ) : null}
        {links.withdrawals && q.withdrawals_pending ? (
          <MetricTile label="Payouts waiting" tone={(q.withdrawals_pending.now ?? 0) > 0 ? 'wait' : 'neutral'}
            value={formatCount(q.withdrawals_pending.now, country)}
            note={(q.withdrawals_pending.now ?? 0) > 0 ? `Oldest ${Math.round(q.withdrawals_oldest_pending_hours ?? 0)} h` : 'Nobody waiting'}
            href={`/finance/payouts?status=pending&scope=${row.code}`} />
        ) : null}
        {links.drivers ? (
          <MetricTile label="KYC queue" tone={(q.kyc_awaiting.now ?? 0) > 0 ? 'wait' : 'neutral'}
            value={formatCount(q.kyc_awaiting.now, country)} note="Drivers with documents to check"
            href={`/kyc?scope=${row.code}`} />
        ) : null}
      </TileGrid>

      <TileGrid variant="dense">
        {countTile('Requested', row.trips.requested, country, w, {
          href: to(links.trips, `/trips?scope=${row.code}`), note: noRequests ? emptyNote : undefined,
        })}
        {countTile('Accepted', row.trips.accepted, country, w, { direction: 'up' })}
        {countTile('Completed', row.trips.completed, country, w, {
          direction: 'up', tone: 'good', href: to(links.trips, `/trips?status=completed&scope=${row.code}`),
        })}
        {countTile('Cancelled', row.trips.cancelled, country, w, {
          direction: 'down', href: to(links.trips, `/trips?status=cancelled&scope=${row.code}`),
        })}
        {countTile('Unfulfilled', row.trips.unfulfilled, country, w, {
          direction: 'down',
        })}
        <MetricTile
          label="Unfulfilled rate"
          value={thin ? NOT_ENOUGH : formatRate(row.rates.unfulfilled_rate.now, country)}
          tone={(row.rates.unfulfilled_rate.now ?? 0) > 15 ? 'wait' : 'neutral'}
          delta={thin ? undefined : tileDelta(unfulfilled, country, w)}
          note={row.rates.unfulfilled_rate.now === null ? emptyNote : undefined}
        />
        <MetricTile
          label="Acceptance rate"
          value={thin ? NOT_ENOUGH : formatRate(row.rates.acceptance_rate.now, country)}
          tone={(row.rates.acceptance_rate.now ?? 100) < 70 ? 'wait' : 'neutral'}
          delta={thin ? undefined : tileDelta(acceptance, country, w)}
          note={row.rates.acceptance_rate.now === null ? emptyNote : undefined}
        />
        <MetricTile
          label="Average ETA"
          value={fewArrivals ? NOT_ENOUGH : formatMinutes(row.rates.avg_eta_minutes.now, country)}
          tone={(row.rates.avg_eta_minutes.now ?? 0) > 8 ? 'wait' : 'neutral'}
          delta={fewArrivals ? undefined : tileDelta(eta, country, w)}
          note={row.rates.avg_eta_minutes.now === null ? 'No arrivals in this window' : undefined}
        />
        <MetricTile
          label="Drivers online"
          value={formatCount(row.drivers.online_now.now, country)}
          note={`${formatCount(row.drivers.active.now, country) ?? '—'} active in window`}
          href={to(links.drivers, `/drivers?status=online&scope=${row.code}`)}
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
            href={to(links.trips, `/trips?status=completed&scope=${row.code}`)}
          />
        ))}
        {row.money && collected.length === 0 ? (
          <MetricTile label={`Collected (${row.currency})`} value={formatCount(0, country)} tone="money" note={emptyNote} />
        ) : null}
        {pendingSums.map((t) => (
          <MetricTile key={`pending-${t.currency}`} label={t.label} value={t.value} tone="money"
            note={`${formatCount(q.withdrawals_pending?.now ?? 0, country)} waiting`}
            href={to(links.withdrawals, '/finance/payouts')} />
        ))}
      </TileGrid>

      <h3 className="ops-subhead">Waiting on you</h3>
      {!(links.safety || links.withdrawals || links.support || links.drivers) && (
        <p className="ops-cc-note" role="note">No work queues are part of your access.</p>
      )}
      <div className="ops-queues">
        {q.sos_open && links.safety && (
          <Queue
            count={sosOpen}
            title="SOS open"
            detail={sosOpen > 0
              ? `Oldest ${formatAge(q.sos_oldest_open_minutes)} unacknowledged`
              : 'None open'}
            href={`/safety-ops?scope=${row.code}`}
            urgent
          />
        )}
        {links.withdrawals && q.withdrawals_pending && (
          <Queue
            count={q.withdrawals_pending.now}
            title="Withdrawals pending"
            detail={(q.withdrawals_pending.now ?? 0) > 0
              ? `Oldest waiting ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(q.withdrawals_oldest_pending_hours ?? 0)} h`
              : 'Nobody waiting to be paid'}
            href={`/finance/payouts?scope=${row.code}`}
          />
        )}
        {links.support && (
          <Queue
            count={q.tickets_open.now}
            title="Tickets open"
            detail={`${formatCount(q.tickets_raised.now, country) ?? '—'} raised in window`}
            href={`/support?scope=${row.code}`}
          />
        )}
        {links.drivers && (
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
