'use client';

import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  balance as loadBalance, daily, nextExpiry, onboarding as loadDocs, period, vehicles as loadVehicles,
} from '@/lib/area/driver';
import { money, rangeLabel, setMarketZone } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';
import { IAlert } from '../icons';
import { LoadError, Skel } from '../states';
import { DocList, docRows } from './DriverDocuments';
import { ReadyCard } from './DriverReady';
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
  // Each card on its own (8 Nov): one failing leaves the others showing.
  const today = useLoad(() => period('today'));
  const week = useLoad(() => period('week'));
  const bal = useLoad(loadBalance);
  const seven = useLoad(daily);
  const docs = useLoad(loadDocs);
  const car = useLoad(async () => (await loadVehicles())[0] ?? null);

  const t = today.data; const w = week.data; const b = bal.data;
  setMarketZone(t?.timezone ?? seven.data?.timezone);
  const cur = t?.currency ?? w?.currency ?? seven.data?.currency ?? b?.currency ?? null;
  const soon = nextExpiry(me, car.data);
  const rows = docRows(docs.data, me, car.data);
  const allOk = rows.length > 0 && rows.every((r) => r.status === 'approved');
  const days = { ...seven, data: seven.data?.days ?? null };

  return (
    <>
      <DriverTop title={tr('Dashboard')} me={me} />
      <main className="dr-main">
        <ReadyCard />
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
            {today.state === 'error' ? <LoadError what="earnings" retry={today.retry} ink /> : t ? (
              <>
                <div className="a40">{money(t.net, t.currency, locale)}</div>
                <div className="a14">{tr('{n} trips · after commission').replace('{n}', `${t.trips}`)}</div>
              </>
            ) : <Skel h={40} w={140} />}
          </div>
          <div className="acard dr-stat">
            <div className="albl">{tr('This week')}</div>
            {week.state === 'error' ? <LoadError what="earnings" retry={week.retry} /> : w ? (
              <>
                <div className="a40">{money(w.net, w.currency, locale)}</div>
                <div className="a14">{rangeLabel(w.start, w.end, locale)} · {tr('{n} trips').replace('{n}', `${w.trips}`)}</div>
              </>
            ) : <Skel h={40} w={140} />}
          </div>
          <div className="acard dr-stat">
            <div className="albl">{tr('Ready to withdraw')}</div>
            {bal.state === 'error' ? <LoadError what="balance" retry={bal.retry} /> : b ? (
              <div className="a40">{money(b.available_balance ?? 0, b.currency ?? cur, locale)}</div>
            ) : <Skel h={40} w={140} />}
            <div className="a14">{tr('Earned minus cash you collected')}</div>
          </div>
        </div>
        <div className="dr-grid2">
          <section className="acard" style={{ padding: 20 }}>
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <h2 className="a20">{tr('Last 7 days')}</h2>
              <Link href="/driver/earnings" className="aacc ab a14">{tr('See earnings')}</Link>
            </div>
            <WeekChart load={days} currency={cur} />
          </section>
          <section className="acard" style={{ padding: 20 }}>
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <h2 className="a20">{tr('Documents')}</h2>
              {allOk && <span className="a14 amut">{tr('All approved')}</span>}
            </div>
            {docs.state === 'error' ? <LoadError what="documents" retry={docs.retry} />
              : docs.data ? <DocList rows={rows} /> : <Skel h={20} lines={4} gap={18} style={{ marginTop: 16 }} />}
          </section>
        </div>
      </main>
    </>
  );
}
