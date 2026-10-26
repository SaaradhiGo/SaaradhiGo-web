'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The console's shared parts.
 *
 * They exist so seven pages stop inventing seven versions of a table, and
 * so two rules are enforced in one place rather than remembered seven
 * times:
 *
 *   * a number nobody could load is NOT shown as zero;
 *   * an empty table says whether it is empty or broken.
 *
 * Both were real: a dashboard of zeroes is indistinguishable from a
 * dashboard whose requests all failed, and an operator who reads "0
 * withdrawals pending" when the fetch died stops looking.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ops-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="ops-head__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * A figure.
 *
 * `value` of `null` means "we could not load this" and renders as
 * "Unavailable", never as 0. `money` only changes the colour; it does not
 * format — the caller owns the currency, because the server tells us which
 * one and a component guessing it is how rupees get printed as dollars.
 */
export function Stat({
  label,
  value,
  note,
  money = false,
}: {
  label: string;
  value: string | number | null | undefined;
  note?: ReactNode;
  money?: boolean;
}) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="ops-stat">
      <span className="ops-stat__label">{label}</span>
      <span
        className={[
          'ops-stat__value',
          money && !missing ? 'ops-stat__value--money' : '',
          missing ? 'ops-stat__value--unknown' : '',
        ].filter(Boolean).join(' ')}
      >
        {missing ? 'Unavailable' : value}
      </span>
      {note ? <span className="ops-stat__note">{note}</span> : null}
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="ops-stats">{children}</div>;
}

/**
 * A pile of work, as a link to where it is done.
 *
 * `count` drives the urgency: nothing waiting is quiet, something waiting
 * is gold, and `urgent` is red and reserved for things with a clock on
 * them — an open SOS, not an unread ticket.
 */
export function Queue({
  count,
  title,
  detail,
  href,
  urgent = false,
}: {
  count: number | null;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}) {
  const waiting = (count ?? 0) > 0;
  const tone = waiting ? (urgent ? 'ops-queue--urgent' : 'ops-queue--waiting') : '';
  return (
    <Link href={href} className={`ops-queue ${tone}`}>
      <span className="ops-queue__n">{count ?? '—'}</span>
      <span className="ops-queue__text">
        <b>{title}</b>
        <span>{detail}</span>
      </span>
      <span className="ops-queue__go" aria-hidden="true">View →</span>
    </Link>
  );
}

export function Panel({
  title,
  action,
  children,
  flush = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Tables sit flush; prose and forms get padding. */
  flush?: boolean;
}) {
  return (
    <section className="ops-panel">
      {title ? (
        <div className="ops-panel__head">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      {flush ? children : <div className="ops-panel__body">{children}</div>}
    </section>
  );
}

export type PillTone = 'good' | 'bad' | 'wait' | 'neutral';

/** Status, carried by a word. The colour only supports it. */
export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  const map: Record<PillTone, string> = {
    good: 'ops-pill--good',
    bad: 'ops-pill--bad',
    wait: 'ops-pill--wait',
    neutral: '',
  };
  return <span className={`ops-pill ${map[tone]}`}>{children}</span>;
}

/**
 * Nothing here — and WHY there is nothing.
 *
 * `error` is the whole point. An empty table and a failed request look the
 * same on screen, and an operator who reads "no payouts pending" when the
 * request actually failed stops looking for the payouts.
 */
export function Empty({
  title,
  detail,
  error = false,
}: {
  title: string;
  detail?: string;
  error?: boolean;
}) {
  return (
    <div className="ops-empty">
      <b style={error ? { color: 'var(--danger)' } : undefined}>{title}</b>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="ops-facts">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ops-fact">
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}

/** A table that looks like every other table in the console. */
export function Table({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ops-table">
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
