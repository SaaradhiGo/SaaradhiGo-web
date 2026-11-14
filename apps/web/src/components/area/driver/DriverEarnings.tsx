'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type History, type MonthRow, downloadStatement, months as loadMonths } from '@/lib/area/earnings';
import { areaGet } from '@/lib/area/api';
import { addition, dateLabel, dateOrder, deduction, money, month3, numericDate } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';
import { messageFor } from '@/lib/publicAuth';
import { IDoc } from '../icons';
import { LoadError, Skel } from '../states';
import { PeriodSwitcher, periodLabel, usePeriod, ymLabel } from './PeriodSwitcher';
import { Sheet } from './Sheet';
import { DriverTop, useDriver } from './parts';

const noon = (d: string) => `${d}T12:00:00Z`;
/** Whole rupees ("₹31,021"): the amount over a bar, like the Dashboard's, in full. */
const whole = (v: number, currency: string | null | undefined, locale: string) => {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(v); }
  catch { return String(Math.round(v)); }
};

function chartTitle(h: History, label: string, tr: (s: string) => string): string {
  if (h.chart.unit === 'hour') return tr('Hour by hour, {p}').replace('{p}', label);
  if (h.chart.unit === 'month') return tr('Month by month, {p}').replace('{p}', label);
  return tr('Day by day, {p}').replace('{p}', label);
}

/**
 * Bars of what was earned; a day's bar opens that day's trips. A period with no trips (11 Nov)
 * keeps its day markers and a flat baseline and says so, never a blank area. The amount sits across
 * the top of each bar where it fits (a week, a year); every bar shows its full breakdown (earned,
 * trips, fares, platform fee) on hover, keyboard focus or a tap. A first tap on a phone shows it;
 * the second opens the day's trips.
 */
function Chart({ h, locale, label }: { h: History; locale: string; label: string }) {
  const tr = useTr();
  const router = useRouter();
  const [tip, setTip] = useState<number | null>(null);
  const touch = useRef(false);
  const openBefore = useRef(false);
  const bars = h.chart.bars;
  const top = Math.max(...bars.map((b) => Number(b.earned)), 0);
  // Weekly ticks, and none so close to the end that it runs into the last date.
  const tickAt = (i: number) => h.chart.unit !== 'day' || bars.length <= 7 || i === 0 || i === bars.length - 1 || (i % 7 === 0 && i < bars.length - 4);
  const tick = (key: string, i: number) => {
    if (h.chart.unit === 'hour') return `${key}:00`;
    if (h.chart.unit === 'month') return month3(new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(`${key.slice(0, 7)}-15T12:00:00Z`)));
    const d = new Date(noon(key));
    return i === 0 || i === bars.length - 1
      ? month3(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)) : String(d.getUTCDate());
  };
  const when = (key: string) => (h.chart.unit === 'hour' ? `${key}:00` : h.chart.unit === 'month' ? ymLabel(key.slice(0, 7), locale)
    : dateLabel(noon(key), locale, 'UTC', new Date(), false));
  const empty = bars.every((b) => b.trips === 0 && Number(b.earned) === 0);
  const across = !empty && h.chart.unit !== 'hour' && bars.length <= 12;
  const m = (v: string | number | undefined) => money(v ?? 0, h.currency, locale) ?? '';
  return (
    <div className={h.chart.unit === 'month' ? 'er-scrollx' : 'er-chart'} onMouseLeave={() => setTip(null)}
      style={{ '--n': bars.length } as React.CSSProperties}>
      <div className={`er-bars${empty ? ' er-bars--empty' : ''}${across ? ' er-bars--amts' : ''}`}
        role="list" aria-label={tr('Earnings by day')} data-empty={empty || undefined}>
        {/* A list may only hold list items (axe aria-required-children, 13 Nov): the empty line is one. */}
        {empty && <div className="a14 amut er-empty" role="listitem"><span role="status">{tr('No trips in {period} yet').replace('{period}', label)}</span></div>}
        {bars.map((b, i) => {
          const v = Number(b.earned);
          const px = top > 0 && v > 0 ? Math.max(4, Math.round((v / top) * 120)) : 0;
          const name = `${when(b.key)}: ${m(b.earned)} · ${tr('{n} trips').replace('{n}', String(b.trips))}`;
          const show = { onMouseEnter: () => setTip(i), onFocus: () => setTip(i), onBlur: () => setTip(null) };
          return (
            <span key={b.key} role="listitem" className="er-col">
              {across && v > 0 && <span className="er-bar__amt" aria-hidden="true">{whole(v, h.currency, locale)}</span>}
              {tip === i && !empty && (
                <span className="er-tip a14" role="tooltip" data-testid="chart-tip" style={i > bars.length / 2 ? { right: 0 } : { left: 0 }}>
                  <span className="ab">{when(b.key)}</span>
                  <span>{tr('You earned')} <span className="ab">{m(b.earned)}</span></span>
                  <span>{tr('{n} trips').replace('{n}', String(b.trips))}</span>
                  {b.fares !== undefined && <span>{tr('Trip fares')} {m(b.fares)}</span>}
                  {b.platform_fee !== undefined && <span>{tr('Platform fee')} {deduction(b.platform_fee, h.currency, locale).text}</span>}
                </span>
              )}
              {h.chart.unit === 'day' ? (
                <button type="button" className={`er-bar${b.key === h.today ? ' er-bar--today' : ''}`} style={{ height: px }} aria-label={name} {...show}
                  // A tap also focuses the bar (which opens its tip), so what counts is whether the tip was open
                  // before this touch began: the first tap shows it, the second opens the day's trips.
                  onPointerDown={(e) => { touch.current = e.pointerType === 'touch'; openBefore.current = tip === i; }}
                  onTouchStart={() => { touch.current = true; openBefore.current = tip === i; }}
                  onClick={() => { if (touch.current && !openBefore.current) { setTip(i); return; } router.push(`/driver/trips?date=${b.key}`); }} />
              ) : (
                <span className="er-bar" style={{ height: px }} aria-label={name} role="img" tabIndex={0} {...show} onClick={() => setTip(tip === i ? null : i)} />
              )}
            </span>
          );
        })}
      </div>
      <div className="er-ticks a14 amut" aria-hidden="true">
        {bars.map((b, i) => <span key={b.key}>{tickAt(i) ? tick(b.key, i) : ''}</span>)}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, ink = false, tone }: { label: string; value: string; sub: string; ink?: boolean; tone?: 'red' | false }) {
  return (
    <div className={`acard er-stat${ink ? ' acard--ink' : ''}`}>
      <div className="albl">{label}</div>
      <div className={`a28${tone === 'red' ? ' ared' : ''}`} data-stat={label}>{value}</div>
      <div className="a14 er-sub">{sub}</div>
    </div>
  );
}

type Statement = {
  summary: MonthRow & Record<string, unknown>; trips: { at: string | null; trip_id: number | null; method: string; fare: string | null; fee: string | null; earned: string | null }[];
  payouts: { at: string; amount: string }[]; currency: string; month: string; start: string; end: string;
  driver: string; phone_masked: string; pan_masked: string | null; city: string; country: string; number: string; produced_on: string; fee_note?: string;
  company: { name: string; address: string; gstin: string };
};

/** A month's statement on screen: the summary, every trip and every payout. */
function StatementSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const tr = useTr();
  const { locale } = useLocale();
  const st = useLoad(() => areaGet<Statement>(`/driver/earnings/statement/?month=${month}`), [month]);
  const s = st.data;
  const m = (v: string | null | undefined) => money(v ?? 0, s?.currency, locale) ?? '';
  const d = (iso: string) => numericDate(iso, dateOrder(s?.country));
  return (
    <Sheet label={tr('Statement, {m}').replace('{m}', ymLabel(month, locale))} onClose={onClose} testid="statement-sheet">
        {st.state === 'error' && <LoadError what="earnings" retry={st.retry} />}
        {s && (
          <div className="td-lines a14" data-testid="statement-head">
            <div className="td-line"><span className="amut">{tr('Statement number')}</span><span className="ab">{s.number}</span></div>
            <div className="td-line"><span className="amut">{tr('Produced on')}</span><span>{d(s.produced_on)}</span></div>
            <div className="td-line"><span className="amut">{tr('Issued by')}</span><span style={{ textAlign: 'right' }}>{[s.company.name, s.company.address].filter(Boolean).join(', ')}</span></div>
            {s.company.gstin && <div className="td-line"><span className="amut">GSTIN</span><span>{s.company.gstin}</span></div>}
            <div className="td-line"><span className="amut">{tr('Driver')}</span><span>{[s.driver, s.phone_masked].filter(Boolean).join(' · ')}</span></div>
            {s.pan_masked && <div className="td-line"><span className="amut">PAN</span><span>{s.pan_masked}</span></div>}
            {s.city && <div className="td-line"><span className="amut">{tr('City')}</span><span>{s.city}</span></div>}
            <div className="td-line"><span className="amut">{tr('Period')}</span><span>{d(s.start)} – {d(s.end)}</span></div>
            {s.fee_note && <div className="td-line"><span className="amut">{tr('Platform fee')}</span><span style={{ textAlign: 'right' }}>{s.fee_note}</span></div>}
          </div>
        )}
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
    </Sheet>
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
  const ps = usePeriod('month');
  const { period, range, hist } = ps;
  const [viewing, setViewing] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const all = useLoad(loadMonths);
  const h = hist.data;
  const m = (v: string | number | null | undefined) => money(v ?? 0, h?.currency ?? all.data?.currency, locale) ?? '';
  const label = h ? periodLabel(h, locale) : '';
  const s = h?.summary;
  const cur = h?.currency ?? all.data?.currency;
  const fee = deduction(s?.platform_fee, cur, locale);
  const statementMonth = h ? h.start.slice(0, 7) : null;

  async function file(month: string, as: 'pdf' | 'csv') {
    setFileErr(null);
    try { await downloadStatement(month, as); } catch (e) { setFileErr(messageFor(e, tr('We could not make that statement. Try again.'))); }
  }

  return (
    <>
      <DriverTop title={tr('Earnings')} me={me} />
      <main className="dr-main">
        <PeriodSwitcher s={ps}>
          <button type="button" className="abtn abtn--ghost" style={{ marginLeft: 8 }} disabled={!statementMonth} data-testid="download-statement"
            onClick={() => statementMonth && void file(statementMonth, 'pdf')}><IDoc size={18} />{tr('Download statement')}</button>
        </PeriodSwitcher>
        {fileErr && <p className="a14 ared" role="alert">{fileErr}</p>}
        {hist.state === 'error' && <LoadError what="earnings" retry={hist.retry} />}
        <div className="er-stats" data-testid="earnings-stats">
          {s && h ? (
            <>
              <Stat ink label={tr('You earned')} value={m(s.earned)}
                sub={`${tr('{n} trips').replace('{n}', String(s.trips))} · ${tr('{n} days driven').replace('{n}', String(s.days_driven))}`} />
              <Stat label={tr('Trip fares')} value={m(s.fares)} sub={tr('Avg {a} per trip').replace('{a}', m(s.avg_fare))} />
              <Stat label={tr('Platform fee')} value={fee.text} tone={fee.red && 'red'} sub={s.fee_note ? tr(s.fee_note) : tr('From your trip ledger')} />
              <Stat label={tr('Tips')} value={addition(s.tips, cur, locale)} sub={s.tips_enabled ? tr('From {n} riders').replace('{n}', String(s.tip_riders)) : tr('Tips are not on yet')} />
              <Stat label={tr('Paid to your bank')} value={m(s.paid_to_bank)}
                sub={tr(s.payouts === 1 ? '{n} payout' : '{n} payouts').replace('{n}', String(s.payouts)) + (Number(s.cash_collected) > 0 ? ` · ${tr('rest in cash')}` : '')} />
            </>
          ) : period === 'custom' && !range ? null : [0, 1, 2, 3, 4].map((i) => <div key={i} className="acard er-stat"><Skel h={56} /></div>)}
        </div>
        {h && (
          <section className="acard" style={{ padding: 20 }} data-testid="earnings-chart">
            <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <h2 className="a20">{chartTitle(h, label, tr)}</h2>
              {h.chart.unit === 'day' && <span className="a14 amut">{tr('Tap a day to see its trips')}</span>}
            </div>
            <Chart h={h} locale={locale} label={label} />
          </section>
        )}
        <section className="acard" style={{ overflow: 'hidden' }} data-testid="all-months">
          <div className="arow er-mhead">
            <h2 className="a20">{tr('All months')}</h2>
            {all.data && <span className="a14 amut">{tr('Since you joined in {m} · statements are ready on the 1st of each month').replace('{m}', ymLabel(all.data.joined, locale))}</span>}
          </div>
          {/* 13 Nov: on phones, one card per month (below); money is never clipped. */}
          <div className={`er-scroll${all.data?.months.length ? ' a-wide' : ''}`}>
            <div className="er-grid albl er-ghead"><span>{tr('Month')}</span><span>{tr('Trips')}</span><span>{tr('Fares')}</span><span>{tr('Platform fee')}</span><span>{tr('Tips')}</span><span>{tr('You earned')}</span><span>{tr('Statement')}</span></div>
            {all.state === 'error' && <div style={{ padding: '0 20px' }}><LoadError what="earnings" retry={all.retry} /></div>}
            {!all.data && all.state !== 'error' && <div style={{ padding: '14px 20px' }}><Skel h={18} lines={2} gap={18} /></div>}
            {all.data?.months.map((row) => (
              <div key={row.month} className="er-grid er-row" data-month={row.month}>
                <span className="ab">{ymLabel(row.month, locale)}{row.so_far ? ` ${tr('(so far)')}` : ''}</span>
                <span>{row.trips}</span>
                <span>{m(row.fares)}</span>
                {(() => { const f = deduction(row.platform_fee, cur, locale); return <span className={f.red ? 'ared' : undefined}>{f.text}</span>; })()}
                <span>{addition(row.tips, cur, locale)}</span>
                <span className="ab agrn" data-earned={row.earned}>{m(row.earned)}</span>
                <span className="arow er-files" style={{ gap: 12 }}>
                  <button type="button" className="su-link a14" onClick={() => setViewing(row.month)}>{tr('View')}</button>
                  <button type="button" className="su-link a14" data-testid={`pdf-${row.month}`} onClick={() => void file(row.month, 'pdf')}>PDF</button>
                  <button type="button" className="su-link a14" data-testid={`csv-${row.month}`} onClick={() => void file(row.month, 'csv')}>CSV</button>
                </span>
              </div>
            ))}
          </div>
          {all.data?.months.length ? (
            <ul className="acards a-phone" style={{ padding: '0 16px 12px' }} data-testid="month-cards">
              {all.data.months.map((row) => {
                const f = deduction(row.platform_fee, cur, locale);
                return (
                  <li key={row.month} data-card-month={row.month}>
                    <div className="arow">
                      <span className="ab">{ymLabel(row.month, locale)}{row.so_far ? ` ${tr('(so far)')}` : ''}</span>
                      <span className="a14 amut">{tr('{n} trips').replace('{n}', String(row.trips))}</span>
                    </div>
                    <div className="arow a14"><span className="amut">{tr('Fares')}</span><span className="amoney">{m(row.fares)}</span></div>
                    <div className="arow a14"><span className="amut">{tr('Platform fee')}</span><span className={`amoney${f.red ? ' ared' : ''}`}>{f.text}</span></div>
                    <div className="arow a14"><span className="amut">{tr('Tips')}</span><span className="amoney">{addition(row.tips, cur, locale)}</span></div>
                    <div className="arow"><span className="ab">{tr('You earned')}</span><span className="ab agrn amoney">{m(row.earned)}</span></div>
                    <div className="arow er-files" style={{ justifyContent: 'flex-start', gap: 16 }}>
                      <button type="button" className="su-link a14" onClick={() => setViewing(row.month)}>{tr('View')}</button>
                      <button type="button" className="su-link a14" onClick={() => void file(row.month, 'pdf')}>PDF</button>
                      <button type="button" className="su-link a14" onClick={() => void file(row.month, 'csv')}>CSV</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="a14 amut er-note">{tr('Every trip and payout is listed under Trips and Payouts, filterable by any date range. Yearly tax summary available from April.')}</div>
        </section>
        {viewing && <StatementSheet month={viewing} onClose={() => setViewing(null)} />}
      </main>
    </>
  );
}
