'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  type Balance, type PeriodTotals, type Withdrawal, balance as loadBalance, period as loadPeriod, withdrawals as loadWithdrawals,
} from '@/lib/area/driver';
import { listWhen, money } from '@/lib/area/format';
import { DriverTop, useDriver } from './parts';

const STATUS: Record<string, [string, string]> = {
  completed: ['apill--ok', 'Paid'], paid: ['apill--ok', 'Paid'], approved: ['apill--warn', 'Approved'],
  pending: ['apill--warn', 'Pending'], processing: ['apill--warn', 'Processing'], rejected: ['apill--err', 'Rejected'],
  failed: ['apill--err', 'Failed'], cancelled: ['apill--neu', 'Cancelled'],
};

/**
 * /driver/payouts (driver-web-payouts.html): the wallet's ready-to-withdraw,
 * what today earned and the cash already in hand, and every payout with its
 * date, time and state. Withdrawing from the web is behind a flag (a money
 * flow, not built tonight); payout details live in the driver app.
 */
export function DriverPayouts() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const [bal, setBal] = useState<Balance | null>(null);
  const [today, setToday] = useState<PeriodTotals | null>(null);
  const [list, setList] = useState<Withdrawal[] | null>(null);

  useEffect(() => {
    loadBalance().then(setBal).catch(() => {});
    loadPeriod('today').then(setToday).catch(() => {});
    loadWithdrawals().then(setList).catch(() => setList([]));
  }, []);

  const words = { today: tr('Today'), yesterday: tr('Yesterday') };
  const tz = today?.timezone ?? null;

  return (
    <>
      <DriverTop title={tr('Payouts')} me={me} />
      <main className="dr-main">
        <div className="dr-grid2 dr-grid2--pay">
          <section className="acard acard--ink dr-stat">
            <div className="albl">{tr('Ready to withdraw')}</div>
            <div className="a40">{bal ? money(bal.available_balance, bal.currency, locale) ?? '—' : '…'}</div>
            {today && (
              <div className="a14">
                {tr('You earned {earned} today and collected {cash} in cash.')
                  .replace('{earned}', money(today.net, today.currency, locale) ?? '—')
                  .replace('{cash}', money(today.cash_collected, today.currency, locale) ?? '—')}
              </div>
            )}
            <div className="a14" style={{ marginTop: 10 }}>{tr('Withdraw from the driver app.')}</div>
          </section>
          <section className="acard" style={{ padding: 20 }}>
            <h2 className="a20">{tr('Payout history')}</h2>
            <div style={{ marginTop: 8 }}>
              {list === null && <p className="aempty">{tr('Loading…')}</p>}
              {list?.length === 0 && <p className="aempty">{tr('No payouts yet.')}</p>}
              {list?.map((w) => {
                const when = listWhen(w.processed_at ?? w.requested_at, locale, tz, words);
                const [cls, label] = STATUS[(w.status ?? '').toLowerCase()] ?? ['apill--neu', w.status ?? ''];
                return (
                  <div key={w.id} className="arow" style={{ padding: '14px 0', borderTop: '1px solid var(--c-border)' }}>
                    <div className="ab" style={{ width: 180 }}>
                      {when?.first}<div className="a14 amut" style={{ fontWeight: 400 }}>{when?.second}</div>
                    </div>
                    <span className="ab agrow">{money(w.amount, w.currency ?? bal?.currency, locale)}</span>
                    <span className={`apill ${cls}`}>{tr(label)}</span>
                  </div>
                );
              })}
            </div>
            <p className="a14 amut" style={{ marginTop: 12 }}>
              {tr('If you collected more cash than you earned, the commission you owe is taken from your next payout. It is never charged twice.')}
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
