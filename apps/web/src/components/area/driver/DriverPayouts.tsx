'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { PAGE_SIZE, balance as loadBalance, payoutPage, period as loadPeriod } from '@/lib/area/driver';
import { listWhen, money, setMarketZone } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';
import { LoadError, Skel } from '../states';
import { Pager, PeriodSwitcher, SearchBox, periodLabel, usePeriod } from './PeriodSwitcher';
import { NextPayout, WithdrawNow } from './WithdrawNow';
import { PayoutMethodCard } from './profile/PayoutMethodCard';
import { DriverTop, useDriver } from './parts';

const STATUS: Record<string, [string, string]> = {
  completed: ['apill--ok', 'Paid'], paid: ['apill--ok', 'Paid'], approved: ['apill--warn', 'Approved'],
  pending: ['apill--warn', 'Pending'], processing: ['apill--warn', 'Processing'], rejected: ['apill--err', 'Rejected'],
  failed: ['apill--err', 'Failed'], cancelled: ['apill--neu', 'Cancelled'],
};

/**
 * /driver/payouts (driver-web-payouts.html): the wallet's ready-to-withdraw,
 * what today earned and the cash already in hand, and every payout with its
 * date, time and state, for any Earnings period (11 Nov) a page at a time back to the first, with a
 * search by payout number, reference or amount. Drivers are paid on a cycle (the next payout is shown);
 * Withdraw now appears only where instant cash-out is on (owner ruling, 9 Nov).
 * Payout details live in the driver app.
 */
export function DriverPayouts() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  // Each card on its own (8 Nov): one failing leaves the others showing.
  const balance = useLoad(loadBalance);
  const todayLoad = useLoad(() => loadPeriod('today'));
  const s = usePeriod('month');
  const h = s.hist.data;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [h?.start, h?.end, q]);
  const payouts = useLoad(() => (h ? payoutPage(h.start, h.end, q, page) : new Promise<never>(() => {})), [h?.start, h?.end, q, page]);
  const bal = balance.data; const today = todayLoad.data; const list = payouts.data?.results ?? null;
  const count = payouts.data?.count ?? 0;
  setMarketZone(today?.timezone);
  const where = h ? periodLabel(h, locale) : '';

  const words = { today: tr('Today'), yesterday: tr('Yesterday') };
  const tz = today?.timezone ?? null;

  return (
    <>
      <DriverTop title={tr('Payouts')} me={me} />
      <main className="dr-main">
        <div className="dr-grid2 dr-grid2--pay">
          <section className="acard acard--ink dr-stat">
            <div className="albl">{tr('Ready to withdraw')}</div>
            {balance.state === 'error' ? <LoadError what="balance" retry={balance.retry} ink /> : bal ? (
              <div className="a40">{money(bal.available_balance ?? 0, bal.currency ?? today?.currency, locale)}</div>
            ) : <Skel h={40} w={140} />}
            {today && (
              <div className="a14">
                {tr('You earned {earned} today and collected {cash} in cash.')
                  .replace('{earned}', money(today.net, today.currency, locale) ?? '—')
                  .replace('{cash}', money(today.cash_collected, today.currency, locale) ?? '—')}
              </div>
            )}
            {bal ? <NextPayout bal={bal} /> : null}
            {bal ? <WithdrawNow bal={bal} onDone={() => { balance.retry(); s.hist.retry(); payouts.retry(); }} /> : null}
          </section>
          <section className="acard" style={{ padding: 20 }}>
            <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <h2 className="a20">{tr('Payout history')}</h2>
              {h && payouts.data && !q && <span className="a14 amut" data-testid="payouts-summary">{where} · {tr(count === 1 ? '{n} payout' : '{n} payouts').replace('{n}', String(count))}</span>}
            </div>
            <div className="pay-period">
              <PeriodSwitcher s={s}><SearchBox label={tr('Search payouts')} onSearch={setQ} /></PeriodSwitcher>
            </div>
            <div style={{ marginTop: 8 }} data-testid="payouts-list">
              {(s.hist.state === 'error' ? s.hist : payouts.state === 'error' ? payouts : null) && (
                <LoadError what="payouts" retry={s.hist.state === 'error' ? s.hist.retry : payouts.retry} />)}
              {s.period === 'custom' && !s.range && <p className="aempty">{tr('Choose the dates to see their payouts.')}</p>}
              {list === null && s.period !== 'custom' && s.hist.state !== 'error' && payouts.state !== 'error' && <Skel h={20} lines={3} gap={22} style={{ marginTop: 12 }} />}
              {list?.length === 0 && <p className="aempty">{!q && h && !h.has_prev && !h.has_next ? tr('No payouts yet.') : q ? tr('No payouts match “{q}” in {period}.').replace('{q}', q).replace('{period}', where)
                : tr('No payouts in {period} yet').replace('{period}', where)}</p>}
              {list?.map((w) => {
                const when = listWhen(w.processed_at ?? w.requested_at, locale, tz, words);
                const [cls, label] = STATUS[(w.status ?? '').toLowerCase()] ?? ['apill--neu', w.status ?? ''];
                const cur = w.currency ?? bal?.currency;
                const fee = (w.fee_minor ?? 0) / 100;
                const instant = w.origin === 'instant';
                return (
                  <div key={w.id}>
                  {/* 13 Nov: on phones, one card per payout with each amount on its own line. */}
                  <div className="acards a-phone" style={{ padding: '10px 0', borderTop: '1px solid var(--c-border)' }} data-testid="payout-card">
                    <div className="arow"><span className="a14 amut">{when ? `${when.first} · ${when.second}` : ''}</span><span className={`apill ${cls}`}>{tr(label)}</span></div>
                    <div className="a20 amoney">{money(w.amount, cur, locale)}</div>
                    {instant && (
                      <>
                        <div className="arow a14"><span className="amut">{tr('Provider fee')}</span><span className="amoney">−{money(fee, cur, locale)}</span></div>
                        <div className="arow a14"><span className="amut">{tr('You received')}</span><span className="ab amoney">{money(Math.max(0, Number(w.amount ?? 0) - fee), cur, locale)}</span></div>
                      </>
                    )}
                  </div>
                  <div className="arow a-wide" style={{ padding: '14px 0', borderTop: '1px solid var(--c-border)' }}>
                    <div className="ab" style={{ width: 180 }}>
                      {when?.first}<div className="a14 amut" style={{ fontWeight: 400 }}>{when?.second}</div>
                    </div>
                    <span className="ab agrow">
                      {money(w.amount, w.currency ?? bal?.currency, locale)}
                      {instant ? (() => {
                        // Withdraw now (10 Nov): the provider fee on the statement line.
                        return (
                          <div className="a14 amut" style={{ fontWeight: 400 }} data-testid="instant-fee-line">
                            {tr('Withdrawn {amount} · provider fee {fee} · received {received}')
                              .replace('{amount}', money(w.amount, cur, locale) ?? '')
                              .replace('{fee}', money(fee, cur, locale) ?? '')
                              .replace('{received}', money(Math.max(0, Number(w.amount ?? 0) - fee), cur, locale) ?? '')}
                          </div>
                        );
                      })() : null}
                    </span>
                    <span className={`apill ${cls}`}>{tr(label)}</span>
                  </div>
                  </div>
                );
              })}
            </div>
            <Pager page={page} count={count} size={PAGE_SIZE} noun={tr(count === 1 ? '{n} payout' : '{n} payouts').replace('{n}', String(count))} onPage={setPage} />
            <p className="a14 amut" style={{ marginTop: 12 }}>
              {tr('If you collected more cash than you earned, the commission you owe is taken from your next payout. It is never charged twice.')}
            </p>
          </section>
        </div>
        <PayoutMethodCard />
      </main>
    </>
  );
}
