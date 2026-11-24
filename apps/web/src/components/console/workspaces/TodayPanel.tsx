'use client';

import { marketDate, stamp } from '@/lib/consoleTime';
import { todayLocal } from '@/lib/reports';
import { DatePresets } from '@/components/console/kit/DatePresets';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import { formatWhole } from '@/lib/trips';

/**
 * What needs action today (owner, 22 Nov, items 3 and 11).
 *
 * Super Admin over everything sees one tile per country, each in its own currency and local day --
 * never one total across countries. Below, every live city in scope lists only what waits (open
 * SOS, approvals, payouts, KYC, stuck trips), each linking to its list, with drivers online. A
 * zero is not a tile: a city with nothing waiting reads "All clear", and when nothing waits
 * anywhere the panel is one line. Test trips and test accounts are not in any figure.
 */

export type TodayAction = { key: string; label: string; count: number | null; link: string; urgent?: boolean };
export type TodayCity = {
  code: string; name: string; country: string; timezone: string;
  actions: TodayAction[]; waiting: number; drivers_online: number; drivers_link: string;
};
export type TodayCountry = {
  code: string; name: string; currency: string; requests: number; completed: number;
  completion_rate: number | null; sos_open: number; payouts_waiting: number;
  payouts_waiting_minor: number | null; revenue_minor: number | null; live_cities: number;
};
export type TodayPayload = {
  generated_at: string; refresh: string; countries: TodayCountry[]; cities: TodayCity[];
  all_clear: boolean; money: boolean;
  /** 23 Nov: the local days the counts cover; null means today. */
  range?: { from: string; to: string } | null;
};
export type Range = { from: string; to: string };

export function useToday() {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const load = useCallback(async () => {
    const q = range ? `?date_from=${range.from}&date_to=${range.to}` : '';
    try { setData(await api.get<TodayPayload>(withScope(`/command-centre/admin/today/${q}`))); } catch { /* the rest of the page still works */ }
  }, [range]);
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { data, range, setRange };
}

function n(v: number) { return v.toLocaleString('en-IN'); }

export function CountryTiles({ countries, onOpen, range }: { countries: TodayCountry[]; onOpen: (code: string) => void; range?: Range | null }) {
  // One country shows its tile only for a chosen range: today's figures are on the page already.
  if (countries.length < 2 && !range) return null;
  const day = (iso: string, code: string) => marketDate(iso, code === 'US' ? 'US' : 'IN');
  const whenFor = (code: string) => (range ? (range.from === range.to ? day(range.from, code) : `${day(range.from, code)} to ${day(range.to, code)}`) : 'today, local time');
  return (
    <section className="ops-today__countries" aria-label="All countries">
      {countries.map((c) => (
        <button key={c.code} type="button" className="ops-today__country" onClick={() => onOpen(c.code)}
          aria-label={`Open ${c.name}`}>
          <span className="ops-today__country-head"><b>{c.name}</b><span className="muted">{c.currency} · {whenFor(c.code)}</span></span>
          <dl className="ops-today__facts">
            <div><dt>Requests</dt><dd className="sg-num">{n(c.requests)}</dd></div>
            <div><dt>Completed</dt><dd className="sg-num">{n(c.completed)}{c.completion_rate !== null ? ` · ${c.completion_rate}%` : ''}</dd></div>
            <div><dt>Open SOS</dt><dd className={`sg-num${c.sos_open ? ' ops-text--critical' : ''}`}>{n(c.sos_open)}</dd></div>
            {c.revenue_minor !== null ? <div><dt>Payouts waiting</dt><dd className="sg-num">{n(c.payouts_waiting)}{c.payouts_waiting ? ` · ${formatWhole(c.payouts_waiting_minor, c.currency)}` : ''}</dd></div> : null}
            {c.revenue_minor !== null ? <div><dt>Revenue</dt><dd className="sg-num">{formatWhole(c.revenue_minor, c.currency)}</dd></div> : null}
          </dl>
        </button>
      ))}
    </section>
  );
}

export function TodayCities({ data, placeName }: { data: TodayPayload; placeName?: string }) {
  if (!data.cities.length) {
    return <p className="ops-today__clear" role="status">No live city in {placeName ?? 'this view'} yet.</p>;
  }
  if (data.all_clear) {
    const online = data.cities.reduce((s, c) => s + c.drivers_online, 0);
    return (
      <p className="ops-today__clear" role="status">
        <b>All clear.</b> Nothing waits in {data.cities.length === 1 ? data.cities[0].name : `${data.cities.length} live cities`} · {n(online)} {online === 1 ? 'driver' : 'drivers'} online.
        {/* 24 Nov (owner): drivers still uploading are not waiting on staff, but stay one click away. */}
        {data.cities.flatMap((c) => c.actions.filter((a) => a.key === 'kyc_uploading' && a.count).map((a) => (
          <Link key={`${c.code}-up`} href={a.link} className="ops-today__act"> {c.name}: <span className="sg-num">{a.count}</span> {a.label}</Link>
        )))}
      </p>
    );
  }
  return (
    <ul className="ops-today__cities" aria-label="What needs action today, by city">
      {data.cities.map((c) => (
        <li key={c.code} className="ops-today__city">
          <b className="ops-today__city-name">{c.name}</b>
          {c.waiting === 0 && !c.actions.some((a) => a.count) ? <span className="muted">All clear</span> : (
            <span className="ops-today__acts">
              {c.actions.filter((a) => a.count).map((a) => (
                <Link key={a.key} href={a.link} className={`ops-today__act${a.urgent ? ' ops-today__act--urgent' : ''}`}>
                  <span className="sg-num">{a.count}</span> {a.label}
                </Link>
              ))}
            </span>
          )}
          <Link href={c.drivers_link} className="ops-today__online"><span className="sg-num">{n(c.drivers_online)}</span> online</Link>
        </li>
      ))}
    </ul>
  );
}

export function TodayPanel({ data, placeName, onOpenCountry, range, onRange }: {
  data: TodayPayload | null; placeName?: string; onOpenCountry: (code: string) => void;
  range?: Range | null; onRange?: (r: Range | null) => void;
}) {
  if (!data) return null;
  const today = todayLocal();
  return (
    <section className="ops-today" aria-label="Today">
      {onRange ? (
        <DatePresets from={range?.from ?? today} to={range?.to ?? today}
          onPick={(r) => onRange(r.from === today && r.to === today ? null : r)} />
      ) : null}
      <CountryTiles countries={data.countries} onOpen={onOpenCountry} range={range} />
      <TodayCities data={data} placeName={placeName} />
      <p className="ops-today__refresh help">{data.refresh} · last update {stamp(data.generated_at, data.cities.length === 1 ? data.cities[0].timezone : null)}</p>
    </section>
  );
}
