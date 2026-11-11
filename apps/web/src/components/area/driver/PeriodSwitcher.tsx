'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type History, type HistoryPeriod, history as loadHistory } from '@/lib/area/earnings';
import { dateLabel, dateOrder, datePlaceholder, monthYear, numericDate, parseNumericDate, rangeLabel, setMarketZone } from '@/lib/area/format';
import { type Load, useLoad } from '@/lib/area/useLoad';
import { IBack, IChevron, IClock, ISearch } from '../icons';
import { useAccount } from '../ProfileMenu';

const TABS: [HistoryPeriod, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom range']];
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
  range: { start: string; end: string } | null; setRange: (r: { start: string; end: string }) => void;
  hist: Load<History | null>;
};

/**
 * The Earnings periods (11 Nov: shared by Earnings, Trips and Payouts): Day, Week, Month, Year
 * (with the Indian tax year) and a custom range, moved with previous and next. The bounds and
 * totals come from the earnings history, so all three pages agree on what a period holds.
 */
export function usePeriod(initial: HistoryPeriod, anchor0?: string): PeriodState {
  const [period, setPeriod] = useState<HistoryPeriod>(initial);
  const [anchor, setAnchor] = useState<string | undefined>(anchor0);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  useEffect(() => { if (anchor0) { setPeriod('day'); setAnchor(anchor0); } }, [anchor0]);
  const hist = useLoad(() => (period === 'custom' && !range ? Promise.resolve(null)
    : loadHistory(period, anchor, period === 'custom' ? range ?? undefined : undefined)), [period, anchor, range]);
  setMarketZone(hist.data?.timezone);
  function pick(p: HistoryPeriod) { setPeriod(p); setAnchor(undefined); if (p !== 'custom') setRange(null); }
  return { period, pick, setAnchor, range, setRange, hist };
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
  const { period, pick, hist, range } = s;
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
            const on = period === p || (p === 'year' && period === 'taxyear');
            return (
              <button key={p} type="button" role="tab" aria-selected={on} className={`achip${on ? ' achip--on' : ' er-tab'}`} onClick={() => pick(p)}>
                {p === 'custom' && <IClock size={16} />}{tr(name)}
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
          {period !== 'custom' && (
            <>
              <button type="button" className="er-arrow" aria-label={tr('Previous')} disabled={!h?.has_prev} onClick={() => h && s.setAnchor(h.prev)}><IBack size={18} /></button>
              <span className="a20 er-label" data-testid="period-label">{h ? periodLabel(h, locale) : ''}</span>
              <button type="button" className="er-arrow" aria-label={tr('Next')} disabled={!h?.has_next} onClick={() => h && s.setAnchor(h.next)}><IChevron size={18} /></button>
            </>
          )}
          {children}
        </div>
      </div>
      {period === 'custom' && (
        <div className="acard er-range">
          <label className="su-field"><span className="a14 ab">{tr('From')}</span>
            <span className="ainput"><input value={from} placeholder={datePlaceholder(order)} inputMode="numeric" onChange={(e) => setFrom(e.target.value)} /></span></label>
          <label className="su-field"><span className="a14 ab">{tr('To')}</span>
            <span className="ainput"><input value={to} placeholder={datePlaceholder(order)} inputMode="numeric" onChange={(e) => setTo(e.target.value)} /></span></label>
          <button type="button" className="abtn abtn--dark" onClick={apply}>{tr('Show')}</button>
          {err && <p className="a14 ared" role="alert" style={{ width: '100%' }}>{err}</p>}
          {range && <p className="a14 amut" style={{ width: '100%' }}>{numericDate(range.start, order)} – {numericDate(range.end, order)}</p>}
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
