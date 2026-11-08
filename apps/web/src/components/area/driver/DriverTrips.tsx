'use client';

import { useMemo, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type Period, history as loadHistory, ledger as loadLedger, period as loadPeriod } from '@/lib/area/driver';
import { dateLabel, listWhen, marketZone, money, rangeLabel, setMarketZone } from '@/lib/area/format';
import { className } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { LoadError, Skel } from '../states';
import { DriverTop, PeriodChips, useDriver } from './parts';

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
function localDate(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** First part of an address, for "Pickup → Drop". */
const short = (a: string | null | undefined) => (a ?? '').split(',')[0].trim();

/**
 * /driver/trips (driver-web-trips.html): each settled trip in the period with
 * its fare, the commission, what the driver earned and how it was paid, from
 * the settlement ledger; the places and class come from the trip.
 */
export function DriverTrips() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const [p, setP] = useState<Period>('today');
  const [all, setAll] = useState(false);
  const totals = useLoad(() => loadPeriod(p), [p]);
  const ledger = useLoad(loadLedger);
  // Places and class only; a row still shows without them.
  const history = useLoad(async () => Object.fromEntries((await loadHistory()).map((x) => [x.id, x])));
  const t = totals.data; const rows = ledger.data; const trips = history.data ?? {};
  setMarketZone(t?.timezone);
  const failed = totals.state === 'error' ? totals : ledger.state === 'error' ? ledger : null;

  const inPeriod = useMemo(() => {
    if (!rows || !t) return null;
    const zone = t.timezone || marketZone();
    return rows.filter((r) => r.created_at && localDate(r.created_at, zone) >= t.start && localDate(r.created_at, zone) <= t.end);
  }, [rows, t]);
  const shown = inPeriod ? (all ? inPeriod : inPeriod.slice(0, 6)) : null;
  const words = { today: tr('Today'), yesterday: tr('Yesterday') };
  const cur = t?.currency;

  return (
    <>
      <DriverTop title={tr('Trips')} me={me} />
      <main className="dr-main">
        <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <PeriodChips value={p} onChange={(v) => { setP(v); setAll(false); }} />
          {t && (
            <span className="a14 amut">
              {(p === 'today' ? dateLabel(`${t.start}T12:00:00Z`, locale, 'UTC') : rangeLabel(t.start, t.end, locale))}
              {' · '}{tr('{n} trips').replace('{n}', `${t.trips}`)}{' · '}{tr('you earned {amount}').replace('{amount}', money(t.net, cur, locale) ?? '—')}
            </span>
          )}
        </div>
        <div className="acard" style={{ overflowX: 'auto' }}>
          <table className="atable">
            <thead>
              <tr className="albl">
                <th>{tr('Date and time')}</th><th>{tr('Trip')}</th><th>{tr('Ride')}</th>
                <th>{tr('Fare')}</th><th>{tr('Commission')}</th><th>{tr('You earned')}</th><th>{tr('Paid')}</th>
              </tr>
            </thead>
            <tbody>
              {failed && <tr><td colSpan={7}><LoadError what="trips" retry={failed.retry} /></td></tr>}
              {!failed && shown === null && [0, 1, 2].map((i) => <tr key={i}><td colSpan={7}><Skel h={18} /></td></tr>)}
              {!failed && rows?.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="ab">{tr('No trips yet')}</div>
                  <div className="a14 amut">{tr('Go online in the driver app to get your first ride request.')}</div>
                </td></tr>
              )}
              {!failed && !!rows?.length && shown?.length === 0 && <tr><td colSpan={7} className="amut">{tr('No trips in this period.')}</td></tr>}
              {shown?.map((r) => {
                const trip = r.trip_id_val ? trips[r.trip_id_val] : undefined;
                const when = listWhen(r.created_at, locale, trip?.timezone ?? t?.timezone, words);
                const route = trip ? `${short(trip.pickup_address)} → ${short(trip.destination_address)}` : r.trip_id_val ? `#${r.trip_id_val}` : '';
                return (
                  <tr key={r.id}>
                    <td>{when && <div className="ab">{when.first}<div className="a14 amut" style={{ fontWeight: 400 }}>{when.second}</div></div>}</td>
                    <td className="ab">{route}</td>
                    <td>{className(trip?.vehicle_info?.type ?? trip?.requested_vehicle_type) ?? ''}</td>
                    <td>{money(r.amount, cur, locale)}</td>
                    <td className="ared">{r.commission != null ? `− ${money(r.commission, cur, locale)}` : ''}</td>
                    <td className="ab agrn">{money(r.net_amount, cur, locale)}</td>
                    <td><span className="apill apill--neu">{tr(r.method === 'cash' ? 'Cash' : 'Online')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {inPeriod && inPeriod.length > 6 && !all && (
            <div className="a14 amut" style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)' }}>
              {tr('Showing {a} of {n}').replace('{a}', '6').replace('{n}', `${inPeriod.length}`)} ·{' '}
              <button type="button" className="aacc ab" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
                onClick={() => setAll(true)}>{tr('Show all')}</button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
