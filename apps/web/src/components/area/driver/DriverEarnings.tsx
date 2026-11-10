'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  type History, type HistoryPeriod, type MonthRow, downloadStatement, history as loadHistory, months as loadMonths,
} from '@/lib/area/earnings';
import { areaGet } from '@/lib/area/api';
import { dateLabel, dateOrder, datePlaceholder, monthYear, money, numericDate, parseNumericDate, rangeLabel, setMarketZone } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';
import { messageFor } from '@/lib/publicAuth';
import { IBack, IChevron, IClock, IDoc } from '../icons';
import { LoadError, Skel } from '../states';
import { DriverTop, useDriver } from './parts';
import { useAccount } from '../ProfileMenu';

const TABS: [HistoryPeriod, string][] = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['custom', 'Custom range']];
const noon = (d: string) => `${d}T12:00:00Z`;
const ymLabel = (ym: string, locale: string) => monthYear(`${ym}-15T12:00:00Z`, locale) ?? ym;

function periodLabel(h: History, locale: string): string {
  if (h.period === 'day') return dateLabel(noon(h.start), locale, 'UTC', new Date(), true);
  if (h.period === 'week' || h.period === 'custom') return rangeLabel(h.start, h.end, locale);
  if (h.period === 'month') return ymLabel(h.start.slice(0, 7), locale);
  if (h.period === 'year') return h.start.slice(0, 4);
  return `${ymLabel(h.start.slice(0, 7), locale)} – ${ymLabel(h.end.slice(0, 7), locale)}`;
}

function chartTitle(h: History, label: string, tr: (s: string) => string): string {
  if (h.chart.unit === 'hour') return tr('Hour by hour, {p}').replace('{p}', label);
  if (h.chart.unit === 'month') return tr('Month by month, {p}').replace('{p}', label);
  return tr('Day by day, {p}').replace('{p}', label);
}

/** Bars of what was earned; a day's bar opens that day's trips. */
function Chart({ h, locale }: { h: History; locale: string }) {
  const tr = useTr();
  const router = useRouter();
  const bars = h.chart.bars;
  const top = Math.max(...bars.map((b) => Number(b.earned)), 0);
  const tickAt = (i: number) => h.chart.unit !== 'day' || bars.length <= 7 || i === 0 || i === bars.length - 1 || i % 7 === 0;
  const tick = (key: string, i: number) => {
    if (h.chart.unit === 'hour') return `${key}:00`;
    if (h.chart.unit === 'month') return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${key}-15T12:00:00Z`));
    const d = new Date(noon(key));
    return i === 0 || i === bars.length - 1
      ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d) : String(d.getUTCDate());
  };
  return (
    <>
      <div className="er-bars" role="list" aria-label={tr('Earnings by day')}>
        {bars.map((b) => {
          const v = Number(b.earned);
          const px = top > 0 && v > 0 ? Math.max(4, Math.round((v / top) * 120)) : 0;
          const label = `${tick(b.key, 0)}: ${money(b.earned, h.currency, locale)} · ${tr('{n} trips').replace('{n}', String(b.trips))}`;
          return h.chart.unit === 'day' ? (
            <button key={b.key} type="button" role="listitem" className={`er-bar${b.key === h.today ? ' er-bar--today' : ''}`}
              style={{ height: px }} aria-label={label} title={label} onClick={() => router.push(`/driver/trips?date=${b.key}`)} />
          ) : <span key={b.key} role="listitem" className="er-bar" style={{ height: px }} aria-label={label} title={label} />;
        })}
      </div>
      <div className="er-ticks a14 amut" aria-hidden="true">
        {bars.map((b, i) => <span key={b.key}>{tickAt(i) ? tick(b.key, i) : ''}</span>)}
      </div>
    </>
  );
}

function Stat({ label, value, sub, ink = false, tone }: { label: string; value: string; sub: string; ink?: boolean; tone?: 'red' }) {
  return (
    <div className={`acard er-stat${ink ? ' acard--ink' : ''}`}>
      <div className="albl">{label}</div>
      <div className={`a28${tone === 'red' ? ' ared' : ''}`} data-stat={label}>{value}</div>
      <div className="a14 er-sub">{sub}</div>
    </div>
  );
}

type Statement = { summary: MonthRow & Record<string, unknown>; trips: { at: string | null; trip_id: number | null; method: string; fare: string | null; fee: string | null; earned: string | null }[]; payouts: { at: string; amount: string }[]; currency: string; month: string };

/** A month's statement on screen: the summary, every trip and every payout. */
function StatementSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const tr = useTr();
  const { locale } = useLocale();
  const st = useLoad(() => areaGet<Statement>(`/driver/earnings/statement/?month=${month}`), [month]);
  const s = st.data;
  const m = (v: string | null | undefined) => money(v ?? 0, s?.currency, locale) ?? '';
  return (
    <div className="asheet-scrim" role="dialog" aria-modal="true" aria-label={tr('Statement')} onClick={onClose}>
      <div className="asheet" onClick={(e) => e.stopPropagation()}>
        <div className="arow" style={{ justifyContent: 'space-between' }}>
          <h2 className="a20">{tr('Statement, {m}').replace('{m}', ymLabel(month, locale))}</h2>
          <button type="button" className="abtn abtn--ghost" onClick={onClose}>{tr('Close')}</button>
        </div>
        {st.state === 'error' && <LoadError what="earnings" retry={st.retry} />}
        {!s && st.state !== 'error' && <Skel h={18} lines={5} gap={12} />}
        {s && (
          <>
            {([['Trip fares', s.summary.fares], ['Platform fee', s.summary.platform_fee], ['Tips', s.summary.tips], ['You earned', s.summary.earned], ['Paid to your bank', s.summary.paid_to_bank]] as const)
              .map(([k, v]) => <div key={k} className="pf-row"><span className="amut">{tr(k)}</span><span className="ab">{m(v)}</span></div>)}
            <h3 className="ab">{tr('Trips ({n})').replace('{n}', String(s.trips.length))}</h3>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {s.trips.map((t, i) => (
                <div key={i} className="pf-row a14"><span>{t.at ? dateLabel(t.at, locale) : ''} {t.trip_id ? `#${t.trip_id}` : ''}</span><span>{m(t.earned)}</span></div>
              ))}
            </div>
            <h3 className="ab">{tr('Payouts ({n})').replace('{n}', String(s.payouts.length))}</h3>
            {s.payouts.map((p, i) => <div key={i} className="pf-row a14"><span>{dateLabel(p.at, locale)}</span><span>{m(p.amount)}</span></div>)}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * /driver/earnings (driver-v2-earnings): any period back to the first trip, the five totals from
 * the ledger, the chart, every month since joining and its statement (View, PDF, CSV).
 */
export function DriverEarnings() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const [acct] = useAccount();
  const india = (acct?.market_country ?? 'IN') !== 'US';
  const order = dateOrder(acct?.market_country);
  const [period, setPeriod] = useState<HistoryPeriod>('month');
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeErr, setRangeErr] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const hist = useLoad(() => (period === 'custom' && !range ? Promise.resolve(null)
    : loadHistory(period, anchor, period === 'custom' ? range ?? undefined : undefined)), [period, anchor, range]);
  const all = useLoad(loadMonths);
  const h = hist.data;
  setMarketZone(h?.timezone);
  const m = (v: string | number | null | undefined) => money(v ?? 0, h?.currency ?? all.data?.currency, locale) ?? '';
  const label = h ? periodLabel(h, locale) : '';
  const s = h?.summary;
  const statementMonth = h ? h.start.slice(0, 7) : null;

  async function file(month: string, as: 'pdf' | 'csv') {
    setFileErr(null);
    try { await downloadStatement(month, as); } catch (e) { setFileErr(messageFor(e, tr('We could not make that statement. Try again.'))); }
  }
  function pick(p: HistoryPeriod) { setPeriod(p); setAnchor(undefined); if (p !== 'custom') setRange(null); }
  function applyRange() {
    const a = parseNumericDate(from, order); const b = parseNumericDate(to, order);
    if (!a || !b || a > b) { setRangeErr(tr('Enter both dates as {p}, the first on or before the second.').replace('{p}', datePlaceholder(order))); return; }
    setRangeErr(null); setRange({ start: a, end: b });
  }

  return (
    <>
      <DriverTop title={tr('Earnings')} me={me} />
      <main className="dr-main">
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
                <button type="button" className="er-arrow" aria-label={tr('Previous')} disabled={!h?.has_prev} onClick={() => h && setAnchor(h.prev)}><IBack size={18} /></button>
                <span className="a20 er-label" data-testid="period-label">{label}</span>
                <button type="button" className="er-arrow" aria-label={tr('Next')} disabled={!h?.has_next} onClick={() => h && setAnchor(h.next)}><IChevron size={18} /></button>
              </>
            )}
            <button type="button" className="abtn abtn--ghost" style={{ marginLeft: 8 }} disabled={!statementMonth} data-testid="download-statement"
              onClick={() => statementMonth && void file(statementMonth, 'pdf')}><IDoc size={18} />{tr('Download statement')}</button>
          </div>
        </div>
        {period === 'custom' && (
          <div className="acard er-range">
            <label className="su-field"><span className="a14 ab">{tr('From')}</span>
              <span className="ainput"><input value={from} placeholder={datePlaceholder(order)} inputMode="numeric" onChange={(e) => setFrom(e.target.value)} /></span></label>
            <label className="su-field"><span className="a14 ab">{tr('To')}</span>
              <span className="ainput"><input value={to} placeholder={datePlaceholder(order)} inputMode="numeric" onChange={(e) => setTo(e.target.value)} /></span></label>
            <button type="button" className="abtn abtn--dark" onClick={applyRange}>{tr('Show')}</button>
            {rangeErr && <p className="a14 ared" role="alert" style={{ width: '100%' }}>{rangeErr}</p>}
            {range && <p className="a14 amut" style={{ width: '100%' }}>{numericDate(range.start, order)} – {numericDate(range.end, order)}</p>}
          </div>
        )}
        {fileErr && <p className="a14 ared" role="alert">{fileErr}</p>}
        {hist.state === 'error' && <LoadError what="earnings" retry={hist.retry} />}
        <div className="er-stats" data-testid="earnings-stats">
          {s && h ? (
            <>
              <Stat ink label={tr('You earned')} value={m(s.earned)}
                sub={`${tr('{n} trips').replace('{n}', String(s.trips))} · ${tr('{n} days driven').replace('{n}', String(s.days_driven))}`} />
              <Stat label={tr('Trip fares')} value={m(s.fares)} sub={tr('Avg {a} per trip').replace('{a}', m(s.avg_fare))} />
              <Stat label={tr('Platform fee')} value={`− ${m(s.platform_fee)}`} tone="red" sub={s.fee_note ? tr(s.fee_note) : tr('From your trip ledger')} />
              <Stat label={tr('Tips')} value={`+ ${m(s.tips)}`} sub={s.tips_enabled ? tr('From {n} riders').replace('{n}', String(s.tip_riders)) : tr('Tips are not on yet')} />
              <Stat label={tr('Paid to your bank')} value={m(s.paid_to_bank)}
                sub={tr('{n} payouts').replace('{n}', String(s.payouts)) + (Number(s.cash_collected) > 0 ? ` · ${tr('rest in cash')}` : '')} />
            </>
          ) : period === 'custom' && !range ? null : [0, 1, 2, 3, 4].map((i) => <div key={i} className="acard er-stat"><Skel h={56} /></div>)}
        </div>
        {h && (
          <section className="acard" style={{ padding: 20 }} data-testid="earnings-chart">
            <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <h2 className="a20">{chartTitle(h, label, tr)}</h2>
              {h.chart.unit === 'day' && <span className="a14 amut">{tr('Tap a day to see its trips')}</span>}
            </div>
            <Chart h={h} locale={locale} />
          </section>
        )}
        <section className="acard" style={{ overflow: 'hidden' }} data-testid="all-months">
          <div className="arow er-mhead">
            <h2 className="a20">{tr('All months')}</h2>
            {all.data && <span className="a14 amut">{tr('Since you joined in {m} · statements are ready on the 1st of each month').replace('{m}', ymLabel(all.data.joined, locale))}</span>}
          </div>
          <div className="er-scroll">
            <div className="er-grid albl er-ghead"><span>{tr('Month')}</span><span>{tr('Trips')}</span><span>{tr('Fares')}</span><span>{tr('Platform fee')}</span><span>{tr('Tips')}</span><span>{tr('You earned')}</span><span>{tr('Statement')}</span></div>
            {all.state === 'error' && <div style={{ padding: '0 20px' }}><LoadError what="earnings" retry={all.retry} /></div>}
            {!all.data && all.state !== 'error' && <div style={{ padding: '14px 20px' }}><Skel h={18} lines={2} gap={18} /></div>}
            {all.data?.months.map((row) => (
              <div key={row.month} className="er-grid er-row" data-month={row.month}>
                <span className="ab">{ymLabel(row.month, locale)}{row.so_far ? ` ${tr('(so far)')}` : ''}</span>
                <span>{row.trips}</span>
                <span>{m(row.fares)}</span>
                <span className="ared">− {m(row.platform_fee)}</span>
                <span>+ {m(row.tips)}</span>
                <span className="ab agrn" data-earned={row.earned}>{m(row.earned)}</span>
                <span className="arow" style={{ gap: 12 }}>
                  <button type="button" className="su-link a14" onClick={() => setViewing(row.month)}>{tr('View')}</button>
                  <button type="button" className="su-link a14" data-testid={`pdf-${row.month}`} onClick={() => void file(row.month, 'pdf')}>PDF</button>
                  <button type="button" className="su-link a14" data-testid={`csv-${row.month}`} onClick={() => void file(row.month, 'csv')}>CSV</button>
                </span>
              </div>
            ))}
          </div>
          <div className="a14 amut er-note">{tr('Every trip and payout is listed under Trips and Payouts, filterable by any date range. Yearly tax summary available from April.')}</div>
        </section>
        {viewing && <StatementSheet month={viewing} onClose={() => setViewing(null)} />}
      </main>
    </>
  );
}
