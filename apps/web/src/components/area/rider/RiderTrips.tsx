'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { listWhen, money } from '@/lib/area/format';
import { className, paidFare, trips as loadTrips } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { localDay, useRiderPeriod } from '@/lib/area/riderPeriod';
import { PeriodSwitcher, SearchBox, periodLabel } from '../driver/PeriodSwitcher';
import { IHelp } from '../icons';
import { LoadError, Skel } from '../states';

type Filter = 'all' | 'completed' | 'cancelled';

/**
 * /trips (rider-web-trips.html): every trip with its date and time in the
 * trip's own time zone, where it went, the class, its status and the fare,
 * with a link to the receipt.
 */
export function RiderTrips() {
  const tr = useTr();
  const { locale } = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const load = useLoad(() => loadTrips(filter === 'all' ? undefined : filter), [filter]);
  // 11 Nov: the driver Trips page's periods and search, over the rider's own trips.
  const s = useRiderPeriod('month');
  const h = s.hist.data;
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    if (!load.data) return null;
    const needle = q.toLowerCase().replace(/^#/, '');
    return load.data.filter((t) => {
      const d = localDay(t.completed_at ?? t.cancelled_at ?? t.requested_at, t.timezone);
      if (!h || !d || d < h.start || d > h.end) return false;
      if (!needle) return true;
      return [t.pickup_address, t.destination_address, String(t.id)].some((x) => (x ?? '').toLowerCase().includes(needle));
    });
  }, [load.data, h, q]);

  const words = { today: tr('Today'), yesterday: tr('Yesterday') };

  return (
    <div className="ar-page" style={{ maxWidth: 1200 }}>
      <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h1 className="a28">{tr('Your trips')}</h1>
          <p className="amut">{tr('Every receipt matches the fare you booked.')}</p>
        </div>
        <div className="arow" style={{ gap: 8 }} role="group" aria-label={tr('Show')}>
          {(['all', 'completed', 'cancelled'] as const).map((f) => (
            <button key={f} type="button" className={`achip${filter === f ? ' achip--on' : ''}`} aria-pressed={filter === f}
              onClick={() => setFilter(f)}>
              {tr(f === 'all' ? 'All' : f === 'completed' ? 'Completed' : 'Cancelled')}
            </button>
          ))}
        </div>
      </div>
      <PeriodSwitcher s={s} />
      <SearchBox label={tr('Search by place or trip number')} onSearch={setQ} />
      <div className="acard" style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label={tr('Your trips')}>
        <table className="atable">
          <thead>
            <tr className="albl">
              <th>{tr('Date and time')}</th><th>{tr('Trip')}</th><th>{tr('Ride')}</th><th>{tr('Status')}</th><th>{tr('Fare')}</th><th />
            </tr>
          </thead>
          <tbody>
            {load.state === 'error' && <tr><td colSpan={6}><LoadError what="trips" retry={load.retry} /></td></tr>}
            {load.state === 'loading' && [0, 1, 2].map((i) => <tr key={i}><td colSpan={6}><Skel h={18} /></td></tr>)}
            {s.period === 'custom' && !h && <tr><td colSpan={6} className="amut">{tr('Choose the dates to see their trips.')}</td></tr>}
            {rows && rows.length === 0 && h && (
              <tr><td colSpan={6}>
                {load.data?.length === 0 ? (
                  <>
                    <div className="ab">{tr('No trips yet')}</div>
                    <div className="a14 amut">{tr('Book your first ride from the Ride page.')}</div>
                  </>
                ) : (
                  <div className="ab" data-testid="trips-none">
                    {q ? tr('No trips match “{q}” in {period}.').replace('{q}', q).replace('{period}', periodLabel(h, locale))
                      : tr('No trips in {period}.').replace('{period}', periodLabel(h, locale))}
                  </div>
                )}
              </td></tr>
            )}
            {rows?.map((t) => {
              const when = listWhen(t.completed_at ?? t.cancelled_at ?? t.requested_at, locale, t.timezone, words);
              const done = t.status === 'completed';
              const cancelled = t.status === 'cancelled';
              const paid = paidFare(t);
              const fare = cancelled && (!paid || Number(paid) === 0) ? tr('No charge') : money(paid ?? t.estimated_fare, t.currency, locale);
              return (
                <tr key={t.id}>
                  <td>
                    {when && <div className="ab">{when.first}<div className="a14 amut" style={{ fontWeight: 400 }}>{when.second}</div></div>}
                  </td>
                  <td>
                    <Link href={done || cancelled ? `/trips/${t.id}` : `/ride/trip/${t.id}`} className="ab" style={{ color: "inherit", display: "block" }}>{t.destination_address}</Link>
                    {t.pickup_address && <div className="a14 amut">{tr('from')} {t.pickup_address}</div>}
                  </td>
                  <td>{className(t.vehicle_info?.type ?? t.requested_vehicle_type)}</td>
                  <td>
                    <span className={`apill ${done ? 'apill--ok' : cancelled ? 'apill--neu' : 'apill--warn'}`}>
                      {tr(done ? 'Completed' : cancelled ? 'Cancelled' : 'In progress')}
                    </span>
                  </td>
                  <td className="ab">{fare}</td>
                  <td>
                    <Link href={done || cancelled ? `/trips/${t.id}` : `/ride/trip/${t.id}`} className="aacc ab a14">
                      {tr(done ? 'Receipt' : cancelled ? 'Details' : 'Open')}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="acard arow" style={{ padding: 20, gap: 16, flexWrap: 'wrap' }}>
        <span className="aico" style={{ background: 'var(--c-gold-bg)', color: 'var(--c-accent)' }}><IHelp /></span>
        <div className="agrow">
          <div className="ab">{tr('Something wrong with a trip?')}</div>
          <div className="a14 amut">{tr('Open the trip and tap Get help. Our team sees the trip details.')}</div>
        </div>
        <Link href="/contact" className="abtn abtn--ghost">{tr('Contact support')}</Link>
      </div>
    </div>
  );
}
