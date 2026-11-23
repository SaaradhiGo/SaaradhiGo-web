'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type History, type HistoryPeriod, history as loadHistory } from '@/lib/area/earnings';
import { dateLabel, dateOrder, datePlaceholder, monthYear, numericDate, parseNumericDate, shownDate, rangeLabel, setMarketZone } from '@/lib/area/format';
import { type Load, useLoad } from '@/lib/area/useLoad';
import { IBack, ICalendar, IChevron, ISearch } from '../icons';
import { useAccount } from '../ProfileMenu';

// 23 Nov (owner): the same presets as every console page with a date range.
export type Tab = 'today' | 'd7' | 'd30' | 'd90' | 'd365' | 'custom';
const TABS: [Tab, string, number][] = [['today', 'Today', 1], ['d7', '7 days', 7], ['d30', '30 days', 30],
  ['d90', '90 days', 90], ['d365', '12 months', 365], ['custom', 'Custom', 0]];
/** Today in the driver's market, as YYYY-MM-DD. */
function marketToday(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}
function daysBack(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}
/** The range a rolling preset covers, ending today in the market (null for Today and Custom). */
export function tabRange(t: Tab, tz?: string): { start: string; end: string } | null {
  const days = TABS.find(([k]) => k === t)?.[2] ?? 0;
  if (t === 'today' || t === 'custom' || !days) return null;
  const end = tz ? marketToday(tz) : new Date().toLocaleDateString('en-CA');
  return { start: daysBack(end, days), end };
}
const noon = (d: string) => `${d}T12:00:00Z`;
export const ymLabel = (ym: string, locale: string) => monthYear(`${ym}-15T12:00:00Z`, locale) ?? ym;

export function periodLabel(h: History, locale: string): string {
  if (h.period === 'day') return dateLabel(noon(h.start), locale, 'UTC', new Date(), true);
  if (h.period === 'week' || h.period === 'custom') return rangeLabel(h.start, h.end, locale);
  if (h.period === 'month') return ymLabel(h.start.slice(0, 7), locale);
  if (h.period === 'year') return h.start.slice(0, 4);
  return `${ymLabel(h.start.slice(0, 7), locale)} – ${ymLabel(h.end.slice(0, 7), locale)}`;
}

export type PeriodState = {
  period: HistoryPeriod; pick: (p: HistoryPeriod) => void; setAnchor: (d: string | undefined) => void;
  tab: Tab; pickTab: (t: Tab, tz: string) => void;
  range: { start: string; end: string } | null; setRange: (r: { start: string; end: string }) => void;
  hist: Load<History | null>;
};

/**
 * The Earnings periods (11 Nov: shared by Earnings, Trips and Payouts): Day, Week, Month, Year
 * (with the Indian tax year) and a custom range, moved with previous and next. The bounds and
 * totals come from the earnings history, so all three pages agree on what a period holds.
 */
export function usePeriod(initial: HistoryPeriod, anchor0?: string): PeriodState {
  // A calendar period asked for by a caller opens as the matching rolling preset (30 days by default).
  const first: Tab = initial === 'day' ? 'today' : initial === 'week' ? 'd7' : initial === 'year' || initial === 'taxyear' ? 'd365' : 'd30';
  const [period, setPeriod] = useState<HistoryPeriod>(first === 'today' ? 'day' : 'custom');
  const [anchor, setAnchor] = useState<string | undefined>(anchor0);
  const [range, setRange] = useState<{ start: string; end: string } | null>(() => tabRange(first));
  const [tab, setTab] = useState<Tab>(first);
  useEffect(() => { if (anchor0) { setPeriod('day'); setAnchor(anchor0); setTab('today'); } }, [anchor0]);
  const hist = useLoad(() => (period === 'custom' && !range ? Promise.resolve(null)
    : loadHistory(period, anchor, period === 'custom' ? range ?? undefined : undefined)), [period, anchor, range]);
  setMarketZone(hist.data?.timezone);
  function pick(p: HistoryPeriod) { setPeriod(p); setAnchor(undefined); if (p !== 'custom') setRange(null); }
  function pickTab(t: Tab, tz: string) {
    setTab(t);
    if (t === 'today') { pick('day'); return; }
    setPeriod('custom'); setAnchor(undefined); setRange(tabRange(t, tz));
  }
  return { period, pick, setAnchor, range, setRange, hist, tab, pickTab };
}

/** The tabs, the year type, previous and next with the period's name, and the custom range form. */
export function PeriodSwitcher({ s, children }: { s: PeriodState; children?: ReactNode }) {
  const tr = useTr();
  const { locale } = useLocale();
  const [acct] = useAccount();
  const india = (acct?.market_country ?? 'IN') !== 'US';
  const order = dateOrder(acct?.market_country);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const { period, pick, hist, range, tab } = s;
  const tz = hist.data?.timezone || (india ? 'Asia/Kolkata' : 'America/Boise');
  const h = hist.data;
  function apply() {
    const a = parseNumericDate(from, order); const b = parseNumericDate(to, order);
    if (!a || !b || a > b) { setErr(tr('Enter both dates as {p}, the first on or before the second.').replace('{p}', datePlaceholder(order))); return; }
    setErr(null); s.setRange({ start: a, end: b });
  }
  return (
    <>
      <div className="er-top">
        <div className="er-tabs" role="tablist" aria-label={tr('Period')}>
          {TABS.map(([p, name]) => {
            const on = tab === p;
            return (
              <button key={p} type="button" role="tab" aria-selected={on} className={`achip${on ? ' achip--on' : ' er-tab'}`} onClick={() => s.pickTab(p, tz)}
                aria-label={p === 'custom' ? tr(name) : undefined} data-period={p}>
                {/* 14 Nov: on a phone Custom range is the calendar alone, so the five fit one row. */}
                {p === 'custom' && <ICalendar size={18} />}<span className={p === 'custom' ? 'er-tab__word' : undefined}>{tr(name)}</span>
              </button>
            );
          })}
        </div>
        <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }}>
          {india && (period === 'year' || period === 'taxyear') && (
            <select aria-label={tr('Year type')} className="achip" value={period} onChange={(e) => pick(e.target.value as HistoryPeriod)}>
              <option value="year">{tr('Calendar year')}</option>
              <option value="taxyear">{tr('Tax year (April to March)')}</option>
            </select>
          )}
          {period === 'day' && (
            <>
              <button type="button" className="er-arrow" aria-label={tr('Previous')} disabled={!h?.has_prev} onClick={() => h && s.setAnchor(h.prev)}><IBack size={18} /></button>
              <span className="a20 er-label" data-testid="period-label">{h ? periodLabel(h, locale) : ''}</span>
              <button type="button" className="er-arrow" aria-label={tr('Next')} disabled={!h?.has_next} onClick={() => h && s.setAnchor(h.next)}><IChevron size={18} /></button>
            </>
          )}
          {children}
        </div>
      </div>
      {tab === 'custom' && (
        <div className="acard er-range">
          <label className="su-field"><span className="a14 ab">{tr('From')}</span>
            <span className="ainput"><input value={from} placeholder={datePlaceholder(order)} inputMode="numeric" onChange={(e) => setFrom(e.target.value)} /></span></label>
          <label className="su-field"><span className="a14 ab">{tr('To')}</span>
            <span className="ainput"><input value={to} placeholder={datePlaceholder(order)} inputMode="numeric" onChange={(e) => setTo(e.target.value)} /></span></label>
          <button type="button" className="abtn abtn--dark" onClick={apply}>{tr('Show')}</button>
          {err && <p className="a14 ared" role="alert" style={{ width: '100%' }}>{err}</p>}
          {range && tab === 'custom' && <p className="a14 amut" style={{ width: '100%' }}>{shownDate(range.start, order)} – {shownDate(range.end, order)}</p>}
        </div>
      )}
    </>
  );
}

/** A search box that answers after the driver stops typing. */
export function SearchBox({ label, onSearch }: { label: string; onSearch: (q: string) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => onSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="ainput er-search">
      <ISearch size={18} />
      <input type="search" value={q} placeholder={label} aria-label={label} onChange={(e) => setQ(e.target.value)} />
    </label>
  );
}

/** "Page 2 of 5 · 93 trips" with previous and next pages. */
export function Pager({ page, count, size, noun, onPage }: { page: number; count: number; size: number; noun: string; onPage: (p: number) => void }) {
  const tr = useTr();
  const pages = Math.max(1, Math.ceil(count / size));
  if (count <= size) return null;
  return (
    <div className="arow a14 er-pager">
      <span className="amut agrow">{tr('Page {p} of {n}').replace('{p}', String(page)).replace('{n}', String(pages))} · {noun}</span>
      <button type="button" className="abtn abtn--ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>{tr('Newer')}</button>
      <button type="button" className="abtn abtn--ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>{tr('Older')}</button>
    </div>
  );
}
