'use client';

import { useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { AREA_FLAGS } from '@/lib/area/flags';
import { type Period, balance as loadBalance, daily, earningsLines, period as loadPeriod } from '@/lib/area/driver';
import { PlatformFeeCard } from './PlatformFeeCard';
import { money, setMarketZone } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';
import { LoadError, Skel } from '../states';
import { DriverTop, PeriodChips, WeekChart, useDriver } from './parts';

function Line({ label, value, strong, tone }: { label: string; value: string | null; strong?: boolean; tone?: 'red' | 'green' }) {
  return (
    <div className="arow" style={{ justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--c-border)' }}>
      <span className={strong ? 'ab' : undefined}>{label}</span>
      <span className={`${strong ? 'a20' : 'ab'}${tone === 'red' ? ' ared' : tone === 'green' ? ' agrn' : ''}`} data-line={label}>{value ?? '—'}</span>
    </div>
  );
}

/**
 * /driver/earnings (driver-web-earnings.html): how the chosen period adds
 * up, line by line from the settlement ledger, what the wallet says is ready
 * to withdraw, and the last seven days. Tips do not exist (owner ruling D5)
 * and withdrawing from the web is not built tonight: both stay behind flags.
 */
export function DriverEarnings() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const [p, setP] = useState<Period>('today');
  // Each card on its own (8 Nov): one failing leaves the others showing.
  const totals = useLoad(() => loadPeriod(p), [p]);
  const balance = useLoad(loadBalance);
  const seven = useLoad(daily);
  const t = totals.data; const bal = balance.data;
  setMarketZone(t?.timezone ?? seven.data?.timezone);

  const head: Record<Period, string> = { today: 'How today adds up', week: 'How this week adds up', month: 'How this month adds up' };
  const lines = t ? earningsLines(t) : null;
  const fmt = (v: number) => money(v, t?.currency, locale);

  return (
    <>
      <DriverTop title={tr('Earnings')} me={me} />
      <main className="dr-main">
        <PeriodChips value={p} onChange={setP} />
        <div className="dr-grid2 dr-grid2--earn">
          <section className="acard" style={{ padding: 20 }} data-testid="earnings-lines">
            <h2 className="a20">{tr(head[p])}</h2>
            <div className="a14 amut">{tr('Every line comes from your trip ledger.')}</div>
            {lines && t ? (
              <div style={{ marginTop: 12 }}>
                <Line label={tr('Trip fares ({n} trips)').replace('{n}', `${t.trips}`)} value={fmt(lines.fares)} />
                <Line label={tr('Commission')} value={`− ${fmt(lines.commission)}`} tone="red" />
                <Line label={tr('You earned')} value={fmt(lines.earned)} strong tone="green" />
                <Line label={tr('Cash you already collected')} value={`− ${fmt(lines.cash)}`} />
                <Line label={tr('Earned minus cash you collected')} value={fmt(lines.afterCash)} strong />
                {t.unresolved_trips > 0 && (
                  <p className="a14 amut" style={{ marginTop: 8 }}>
                    {tr('{n} trips are still being settled and are not in these lines yet.').replace('{n}', `${t.unresolved_trips}`)}
                  </p>
                )}
              </div>
            ) : totals.state === 'error' ? (
              <LoadError what="earnings" retry={totals.retry} />
            ) : (
              <Skel h={22} lines={5} gap={26} style={{ marginTop: 22 }} />
            )}
          </section>
          <div className="acol" style={{ gap: 16 }}>
            <section className="acard acard--ink dr-stat">
              <div className="albl">{tr('Ready to withdraw')}</div>
              {balance.state === 'error' ? <LoadError what="balance" retry={balance.retry} ink /> : bal ? (
                <div className="a40">{money(bal.available_balance ?? 0, bal.currency ?? t?.currency, locale)}</div>
              ) : <Skel h={40} w={140} />}
              {AREA_FLAGS.withdraw ? null : (
                <div className="a14" style={{ marginTop: 10 }}>{tr('Withdraw from the driver app.')}</div>
              )}
            </section>
            <section className="acard" style={{ padding: 20 }}>
              <h2 className="a20">{tr('Last 7 days')}</h2>
              <WeekChart load={{ ...seven, data: seven.data?.days ?? null }}
                currency={seven.data?.currency ?? t?.currency ?? bal?.currency ?? null} />
            </section>
            <PlatformFeeCard days={seven.data?.days ?? null} currency={seven.data?.currency ?? t?.currency ?? null} />
          </div>
        </div>
      </main>
    </>
  );
}
