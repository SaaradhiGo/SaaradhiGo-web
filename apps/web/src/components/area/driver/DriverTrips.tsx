'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { PAGE_SIZE, ledgerPage } from '@/lib/area/driver';
import { deduction, listWhen, money } from '@/lib/area/format';
import { className } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { LoadError, Skel } from '../states';
import { Pager, PeriodSwitcher, SearchBox, periodLabel, usePeriod } from './PeriodSwitcher';
import { DriverTop, useDriver } from './parts';

/** First part of an address, for "Pickup → Drop". */
const short = (a: string | null | undefined) => (a ?? '').split(',')[0].trim();

/**
 * /driver/trips (driver-web-trips.html): every settled trip in the period with its fare, the
 * commission, what the driver earned and how it was paid, from the settlement ledger, a page at a
 * time back to the first trip. The periods are Earnings' (11 Nov) and a search finds a place or a
 * trip number; a bar of the earnings chart opens its day (?date=YYYY-MM-DD).
 */
export function DriverTrips() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const day = useSearchParams()?.get('date') ?? undefined;
  const s = usePeriod('day', day);
  const h = s.hist.data;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [h?.start, h?.end, q]);
  const rows = useLoad(() => (h ? ledgerPage(h.start, h.end, q, page) : new Promise<never>(() => {})), [h?.start, h?.end, q, page]);
  const failed = s.hist.state === 'error' ? s.hist : rows.state === 'error' ? rows : null;
  const list = rows.data?.results ?? null;
  const count = rows.data?.count ?? 0;
  const words = { today: tr('Today'), yesterday: tr('Yesterday') };
  const cur = h?.currency;

  return (
    <>
      <DriverTop title={tr('Trips')} me={me} />
      <main className="dr-main">
        <PeriodSwitcher s={s} />
        <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <SearchBox label={tr('Search by place or trip number')} onSearch={setQ} />
          {h && (
            <span className="a14 amut" data-testid="trips-summary">
              {periodLabel(h, locale)}{' · '}{tr('{n} trips').replace('{n}', `${h.summary.trips}`)}{' · '}
              {tr('you earned {amount}').replace('{amount}', money(h.summary.earned, cur, locale) ?? '—')}
            </span>
          )}
        </div>
        <div className="acard" style={{ overflowX: 'auto' }}>
          <table className="atable" data-testid="trips-table">
            <thead>
              <tr className="albl">
                <th>{tr('Date and time')}</th><th>{tr('Trip')}</th><th>{tr('Ride')}</th>
                <th>{tr('Fare')}</th><th>{tr('Commission')}</th><th>{tr('You earned')}</th><th>{tr('Paid')}</th>
              </tr>
            </thead>
            <tbody>
              {failed && <tr><td colSpan={7}><LoadError what="trips" retry={failed.retry} /></td></tr>}
              {!failed && list === null && s.period !== 'custom' && [0, 1, 2].map((i) => <tr key={i}><td colSpan={7}><Skel h={18} /></td></tr>)}
              {!failed && s.period === 'custom' && !s.range && <tr><td colSpan={7} className="amut">{tr('Choose the dates to see their trips.')}</td></tr>}
              {!failed && list?.length === 0 && !q && h && !h.has_prev && !h.has_next && (
                <tr><td colSpan={7}>
                  <div className="ab">{tr('No trips yet')}</div>
                  <div className="a14 amut">{tr('Go online in the driver app to get your first ride request.')}</div>
                </td></tr>
              )}
              {!failed && list?.length === 0 && (q || !h || h.has_prev || h.has_next) && (
                <tr><td colSpan={7} className="amut">
                  {q ? tr('No trips match “{q}” in {period}.').replace('{q}', q).replace('{period}', h ? periodLabel(h, locale) : '')
                    : tr('No trips in {period} yet').replace('{period}', h ? periodLabel(h, locale) : '')}
                </td></tr>
              )}
              {list?.map((r) => {
                const when = listWhen(r.created_at, locale, h?.timezone, words);
                const places = r.pickup_address || r.destination_address ? `${short(r.pickup_address)} → ${short(r.destination_address)}` : '';
                const fee = deduction(r.commission, cur, locale);
                return (
                  <tr key={r.id}>
                    <td>{when && <div className="ab">{when.first}<div className="a14 amut" style={{ fontWeight: 400 }}>{when.second}</div></div>}</td>
                    <td className="ab">{places}{r.trip_id_val ? <div className="a14 amut" style={{ fontWeight: 400 }}>#{r.trip_id_val}</div> : null}</td>
                    <td>{className(r.ride_class) ?? ''}</td>
                    <td>{money(r.amount, cur, locale)}</td>
                    <td className={fee.red ? 'ared' : undefined}>{r.commission != null ? fee.text : ''}</td>
                    <td className="ab agrn">{money(r.net_amount, cur, locale)}</td>
                    <td><span className="apill apill--neu">{tr(r.method === 'cash' ? 'Cash' : 'Online')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={page} count={count} size={PAGE_SIZE} noun={tr('{n} trips').replace('{n}', String(count))} onPage={setPage} />
        </div>
      </main>
    </>
  );
}
