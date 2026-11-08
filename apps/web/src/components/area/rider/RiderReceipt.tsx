'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { formatPlate } from '@/lib/booking';
import { clock, dateLabel, money } from '@/lib/area/format';
import { type Trip, className, lockedFare, paidFare, rateTrip, receiptPdf, trip as loadTrip } from '@/lib/area/rider';
import { readSessionUser } from '@/lib/publicAuth';
import { IBack, IDownload, IHelp, IUser } from '../icons';

const STAR = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z';

/**
 * /trips/[id] (rider-web-receipt.html): what the rider paid against the fare
 * they locked, any change between the two, the trip's times and the driver,
 * the PDF, help and the rating.
 */
export function RiderReceipt({ id }: { id: string }) {
  const tr = useTr();
  const { locale } = useLocale();
  const [t, setT] = useState<Trip | null>(null);
  const [failed, setFailed] = useState(false);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    loadTrip(id).then((d) => {
      setT(d);
      const me = readSessionUser()?.id;
      const mine = d.ratings?.find((r) => me != null && `${r.rater_id}` === `${me}`);
      if (mine?.score) setStars(mine.score);
    }).catch(() => setFailed(true));
  }, [id]);

  if (failed) return <div className="ar-page"><p className="amut">{tr('We could not load this trip.')}</p></div>;
  if (!t) return <div className="ar-page"><p className="amut">{tr('Loading…')}</p></div>;

  const cur = t.currency;
  const locked = lockedFare(t);
  const paid = paidFare(t);
  const change = locked != null && paid != null ? Number(paid) - Number(locked) : null;
  const same = change !== null && Math.abs(change) < 0.005;
  const cancelled = t.status === 'cancelled';
  const v = t.vehicle_info ?? null;
  const ride = className(v?.type ?? t.requested_vehicle_type);
  const when = t.completed_at ?? t.cancelled_at ?? t.requested_at;
  const paidHow = t.payment_method === 'cash' ? tr('Paid in cash') : t.payment_method ? tr('Paid online') : null;
  const km = t.actual_distance_km ?? t.estimated_distance_km;

  async function pdf() {
    try {
      const r = await receiptPdf(id);
      if (r.pdf_url) window.open(r.pdf_url, '_blank', 'noopener');
      else setNote(tr('The receipt is not ready yet.'));
    } catch {
      setNote(tr('The receipt is not ready yet.'));
    }
  }

  async function rate(n: number) {
    try {
      await rateTrip(id, n);
      setStars(n);
      setNote(tr('Thanks for rating your trip.'));
    } catch {
      setNote(tr('We could not save your rating.'));
    }
  }

  return (
    <div className="ar-page" style={{ maxWidth: 1000 }}>
      <Link href="/trips" className="arow a14 ab amut" style={{ gap: 6, textDecoration: 'none' }}><IBack size={16} />{tr('Your trips')}</Link>
      <div className="dr-grid2 dr-grid2--receipt">
        <div className="acard" style={{ padding: 24 }}>
          <div className="arow" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div className="a28">{cancelled && (!paid || Number(paid) === 0) ? tr('No charge') : money(paid ?? locked, cur, locale)}</div>
              <div className="amut">
                {[when ? dateLabel(when, locale, t.timezone, new Date(), true) : null, ride, cancelled ? tr('Cancelled') : paidHow]
                  .filter(Boolean).join(' · ')}
              </div>
            </div>
            {same && !cancelled && <span className="apill apill--ok">{tr('Matches your locked fare')}</span>}
          </div>
          <div className="asep" style={{ marginTop: 16 }}>
            <div className="arow" style={{ justifyContent: 'space-between', padding: '12px 0' }}>
              <span>{tr('Locked fare at booking')}</span><span className="ab">{money(locked, cur, locale)}</span>
            </div>
            <div className="arow" style={{ justifyContent: 'space-between', padding: '12px 0' }}>
              <span>{tr('Changes during the trip')}</span>
              <span className="ab">{change === null ? '' : same ? tr('None') : `${change > 0 ? '+' : '−'}${money(Math.abs(change), cur, locale)}`}</span>
            </div>
            <div className="arow" style={{ justifyContent: 'space-between', padding: '12px 0' }}>
              <span className="ab">{tr('You paid')}</span><span className="a20">{money(paid, cur, locale) ?? '—'}</span>
            </div>
          </div>
          <p className="a14 amut" style={{ marginTop: 8 }}>{tr('If the trip had changed, each change and its reason would be listed here.')}</p>
          <div className="arow" style={{ gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <button type="button" className="abtn abtn--ghost" onClick={pdf}><IDownload size={18} />{tr('Download PDF')}</button>
            <Link href="/contact" className="abtn abtn--ghost"><IHelp size={18} />{tr('Get help with this trip')}</Link>
          </div>
          {note && <p className="a14 amut" role="status" style={{ marginTop: 12 }}>{note}</p>}
        </div>
        <div className="acard acol" style={{ padding: 24, gap: 14 }}>
          <div className="a20">{tr('Trip')}</div>
          <div className="arow" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span className="adot adot--on" style={{ marginTop: 8 }} aria-hidden="true" />
            <div>
              <div className="ab">{t.pickup_address}</div>
              {t.started_at && (
                <div className="a14 amut">{tr('Picked up')} {clock(t.started_at, locale, t.timezone)} · {dateLabel(t.started_at, locale, t.timezone)}</div>
              )}
            </div>
          </div>
          <div className="arow" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span className="adot" style={{ marginTop: 8, background: 'var(--c-text)', borderRadius: 2 }} aria-hidden="true" />
            <div>
              <div className="ab">{t.destination_address}</div>
              {t.completed_at && (
                <div className="a14 amut">
                  {tr('Dropped')} {clock(t.completed_at, locale, t.timezone)}{km != null ? ` · ${Number(km).toFixed(Number(km) < 10 ? 1 : 0)} km` : ''}
                </div>
              )}
            </div>
          </div>
          {t.driver_name && (
            <div className="arow" style={{ paddingTop: 14, borderTop: '1px solid var(--c-border)' }}>
              <span className="aico" style={{ width: 44, height: 44, borderRadius: 22, background: 'var(--c-border)' }}><IUser /></span>
              <div className="agrow">
                <div className="ab">{t.driver_name}</div>
                <div className="a14 amut">{[v?.color, ride, v?.vehicle_number ? formatPlate(v.vehicle_number) : null].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          )}
          {t.status === 'completed' && (
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <span className="a14 amut">{tr('Rate your trip')}</span>
              <span className="arow" style={{ gap: 4 }} role="radiogroup" aria-label={tr('Rate your trip')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}`}
                    onClick={() => rate(n)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--c-primary)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={n <= stars ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true"><path d={STAR} /></svg>
                  </button>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
