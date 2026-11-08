'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  type Balance, type Day, type Onboarding, type PeriodTotals, type Vehicle,
  balance as loadBalance, days as loadDays, nextExpiry, onboarding as loadDocs, period, vehicles as loadVehicles,
} from '@/lib/area/driver';
import { money, rangeLabel } from '@/lib/area/format';
import { IAlert } from '../icons';
import { DocList, docRows } from './DriverDocuments';
import { DriverTop, WeekChart, useDriver } from './parts';

/**
 * /driver (driver-web-dashboard.html): an expiry warning when a document is
 * close, today's and this week's earnings after commission, what is ready to
 * withdraw, the last seven days, and the documents.
 */
export function DriverDashboard() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const [today, setToday] = useState<PeriodTotals | null>(null);
  const [week, setWeek] = useState<PeriodTotals | null>(null);
  const [bal, setBal] = useState<Balance | null>(null);
  const [seven, setSeven] = useState<Day[] | null>(null);
  const [docs, setDocs] = useState<Onboarding | null>(null);
  const [car, setCar] = useState<Vehicle | null>(null);

  useEffect(() => {
    period('today').then(setToday).catch(() => {});
    period('week').then(setWeek).catch(() => {});
    loadBalance().then(setBal).catch(() => {});
    loadDays(7).then(setSeven).catch(() => setSeven([]));
    loadDocs().then(setDocs).catch(() => {});
    loadVehicles().then((v) => setCar(v[0] ?? null)).catch(() => {});
  }, []);

  const cur = today?.currency ?? week?.currency ?? bal?.currency ?? null;
  const soon = nextExpiry(me, car);
  const rows = docRows(docs, me, car);
  const allOk = rows.length > 0 && rows.every((r) => r.status === 'approved');

  return (
    <>
      <DriverTop title={tr('Dashboard')} me={me} />
      <main className="dr-main">
        {soon && (
          <div className="anote">
            <span className="anote__icon"><IAlert /></span>
            <div className="agrow">
              <div className="ab">
                {soon.days < 0
                  ? tr('Your {doc} has expired').replace('{doc}', tr(soon.label).toLowerCase())
                  : tr('Your {doc} expires in {n} days').replace('{doc}', tr(soon.label).toLowerCase()).replace('{n}', `${soon.days}`)}
              </div>
              <div className="a14 amut">{tr('Upload the renewed document so you can keep driving without a break.')}</div>
            </div>
            <Link href="/driver/documents" className="abtn abtn--dark">{tr('Upload renewal')}</Link>
          </div>
        )}
        <div className="dr-grid3">
          <div className="acard acard--ink dr-stat">
            <div className="albl">{tr('Today you earned')}</div>
            <div className="a40">{today ? money(today.net, today.currency, locale) : '…'}</div>
            {today && <div className="a14">{tr('{n} trips · after commission').replace('{n}', `${today.trips}`)}</div>}
          </div>
          <div className="acard dr-stat">
            <div className="albl">{tr('This week')}</div>
            <div className="a40">{week ? money(week.net, week.currency, locale) : '…'}</div>
            {week && <div className="a14">{rangeLabel(week.start, week.end, locale)} · {tr('{n} trips').replace('{n}', `${week.trips}`)}</div>}
          </div>
          <div className="acard dr-stat">
            <div className="albl">{tr('Ready to withdraw')}</div>
            <div className="a40">{bal ? money(bal.available_balance, bal.currency, locale) ?? '—' : '…'}</div>
            <div className="a14">{tr('Earned minus cash you collected')}</div>
          </div>
        </div>
        <div className="dr-grid2">
          <section className="acard" style={{ padding: 20 }}>
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <h2 className="a20">{tr('Last 7 days')}</h2>
              <Link href="/driver/earnings" className="aacc ab a14">{tr('See earnings')}</Link>
            </div>
            <WeekChart days={seven} currency={cur} />
          </section>
          <section className="acard" style={{ padding: 20 }}>
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <h2 className="a20">{tr('Documents')}</h2>
              {allOk && <span className="a14 amut">{tr('All approved')}</span>}
            </div>
            <DocList rows={rows} />
          </section>
        </div>
      </main>
    </>
  );
}
