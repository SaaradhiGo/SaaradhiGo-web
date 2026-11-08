'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MapSurface from '@/components/MapSurface';
import { TripSafety } from '@/components/booking/TripSafety';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { RIDER_CANCEL_REASONS, RideSocket, type SocketEvent, cancelTrip, formatPlate } from '@/lib/booking';
import { shareTripText } from '@/lib/tripSafety';
import { money } from '@/lib/area/format';
import { type Trip, className, lockedFare, trip as loadTrip, tripDriver } from '@/lib/area/rider';
import { ILock, IShare, IShield, IUser } from '../icons';

const OVER = ['completed', 'cancelled'];

/** The status line for each trip state; null hides the pill. */
function statusWords(s: string): { pill: string; head: string } {
  switch (s) {
    case 'requested': case 'pending': case 'searching':
      return { pill: 'Finding your driver', head: 'Finding your driver' };
    case 'accepted': case 'driver_assigned': case 'on_the_way':
      return { pill: 'Driver on the way', head: 'Your driver is on the way' };
    case 'arrived': case 'reached':
      return { pill: 'Driver has arrived', head: 'Your driver is here' };
    case 'started': case 'in_progress': case 'ongoing':
      return { pill: 'On the trip', head: 'On your way' };
    case 'completed':
      return { pill: 'Trip complete', head: 'You have arrived' };
    case 'cancelled':
      return { pill: 'Cancelled', head: 'This ride was cancelled' };
    default:
      return { pill: 'Driver on the way', head: 'Your driver is on the way' };
  }
}

/**
 * /ride/trip/[id] (rider-web-trip.html): the trip's status, the driver and
 * car, the ride code as dots until Show, Share and Safety, the locked fare
 * and Cancel. Live updates come over the trip socket; the page also reads
 * the trip once so a reload shows where things are.
 */
export function RideTrip({ id }: { id: string }) {
  const tr = useTr();
  const { locale } = useLocale();
  const router = useRouter();
  const [t, setT] = useState<Trip | null>(null);
  const [state, setState] = useState<string>('requested');
  const [rating, setRating] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [driverAt, setDriverAt] = useState<{ lat: number; lng: number } | null>(null);
  const [safety, setSafety] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string>(RIDER_CANCEL_REASONS[0].value);
  const [note, setNote] = useState<string | null>(null);
  const sock = useRef<RideSocket | null>(null);

  const refresh = useCallback(async () => {
    const d = await loadTrip(id).catch(() => null);
    if (!d) return;
    setT(d);
    if (d.status) setState(d.status);
    if (d.otp !== null && d.otp !== undefined && `${d.otp}` !== '') setCode(`${d.otp}`);
    if (d.driver_name) {
      tripDriver(id).then((x) => setRating(x.driver_rating != null && Number(x.driver_rating) > 0 ? Number(x.driver_rating).toFixed(1) : null)).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const s = new RideSocket(`/ws/ride/trip/${id}/`, (e: SocketEvent) => {
      if (e.type === 'connection_established' && e.otp != null && `${e.otp}` !== '') setCode(`${e.otp}`);
      if (e.type === 'driver_location_update') {
        const lat = Number(e.lat); const lng = Number(e.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) setDriverAt({ lat, lng });
      }
      if (e.type === 'trip_update' || e.type === 'trip_status_update' || e.type === 'connection_established') {
        const st = (e.status ?? e.trip_status ?? (e.trip as Record<string, unknown> | undefined)?.status) as string | undefined;
        if (st) setState(st);
        const otp = e.otp ?? (e.trip as Record<string, unknown> | undefined)?.otp;
        if (otp != null && `${otp}` !== '') setCode(`${otp}`);
        refresh();
      }
    }, () => {});
    sock.current = s;
    s.open();
    return () => s.close();
  }, [id, refresh]);

  const words = statusWords(state);
  const over = OVER.includes(state);
  const v = t?.vehicle_info ?? null;
  const plate = v?.vehicle_number ? formatPlate(v.vehicle_number) : null;
  const car = [v?.color, [v?.brand, v?.model].filter(Boolean).join(' ')].filter(Boolean).join(' ');
  const ride = className(v?.type ?? t?.requested_vehicle_type);
  const fare = t ? money(lockedFare(t), t.currency, locale) : null;
  const pickup = t && Number.isFinite(Number(t.pickup_lat)) ? { lat: Number(t.pickup_lat), lng: Number(t.pickup_long) } : null;
  const drop = t && Number.isFinite(Number(t.destination_lat)) ? { lat: Number(t.destination_lat), lng: Number(t.destination_long) } : null;

  async function share() {
    const text = shareTripText({
      tripId: id, driverName: t?.driver_name, plate, pickupLabel: t?.pickup_address, destinationLabel: t?.destination_address,
    });
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setNote(tr('Trip details copied. Paste them to share.')); }
    } catch { /* the rider closed the share sheet */ }
  }

  async function cancel() {
    try {
      await cancelTrip(id, reason);
      setCancelling(false);
      setState('cancelled');
    } catch {
      setNote(tr('We could not cancel this ride. Try again.'));
    }
  }

  return (
    <div className="ar-split">
      <aside className="ar-panel">
        <div>
          <span className={`apill ${state === 'cancelled' ? 'apill--neu' : 'apill--ok'}`}>{tr(words.pill)}</span>
          <h1 className="a28" style={{ marginTop: 12 }}>{tr(words.head)}</h1>
          {t?.pickup_address && !over && <p className="amut">{tr('Pickup')}: {t.pickup_address}</p>}
        </div>

        {t?.driver_name && !over && (
          <div className="acard acol" style={{ padding: 16, gap: 14 }}>
            <div className="arow">
              <span className="aico" style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--c-border)' }}><IUser /></span>
              <div className="agrow">
                <div className="a20">{t.driver_name}{rating ? ` · ${rating}` : ''}</div>
                <div className="a14 amut">{[car, ride].filter(Boolean).join(' · ')}</div>
              </div>
              {plate && <div className="ab a14" style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid var(--c-text)', whiteSpace: 'nowrap' }}>{plate}</div>}
            </div>
            {code && (
              <div className="arow" style={{ justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'var(--c-gold-bg)' }}>
                <div>
                  <div className="a14 ab aacc">{tr('Your ride code')}</div>
                  <div className="a14 amut">{tr('Tell the driver in person')}</div>
                </div>
                {shown ? (
                  <span className="a20" style={{ letterSpacing: '0.2em' }} aria-live="polite">{code}</span>
                ) : (
                  <span className="arow" style={{ gap: 6 }} aria-label={tr('Ride code hidden')}>
                    {code.split('').map((_, i) => (
                      <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--c-text)' }} />
                    ))}
                  </span>
                )}
                <button type="button" className="abtn abtn--ghost a14" style={{ height: 36, padding: '0 12px' }} onClick={() => setShown(!shown)}>
                  {shown ? tr('Hide') : tr('Show')}
                </button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <button type="button" className="abtn abtn--ghost a14" onClick={share}><IShare size={18} />{tr('Share')}</button>
              <button type="button" className="abtn abtn--ghost a14" style={{ color: 'var(--c-red)' }} onClick={() => setSafety(!safety)}>
                <IShield size={18} />{tr('Safety')}
              </button>
            </div>
          </div>
        )}
        {safety && (
          <div className="site">
            <TripSafety tripId={id} driverName={t?.driver_name} plate={plate} pickupLabel={t?.pickup_address}
              destinationLabel={t?.destination_address} position={driverAt} pickup={pickup} />
          </div>
        )}

        {t && (
          <div className="acard acol" style={{ padding: '14px 16px', gap: 8 }}>
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <span className="ab">{ride}</span>
              <span className="arow" style={{ gap: 8 }}>
                {fare && <span className="a20">{fare}</span>}
                {fare && <span className="apill apill--ok"><ILock size={14} />{tr('Locked')}</span>}
              </span>
            </div>
            {t.destination_address && <div className="a14 amut">{tr('To')} {t.destination_address}</div>}
            {fare && t.payment_method === 'cash' && !over && (
              <div className="a14 amut">{tr('Pay {fare} in cash to your driver at the end.').replace('{fare}', fare)}</div>
            )}
          </div>
        )}
        {note && <p className="a14 amut" role="status">{note}</p>}

        {state === 'completed' && (
          <Link href={`/trips/${id}`} className="abtn abtn--pri abtn--block">{tr('See your receipt')}</Link>
        )}
        {state === 'cancelled' && (
          <button type="button" className="abtn abtn--pri abtn--block" onClick={() => router.push('/ride')}>{tr('Book another ride')}</button>
        )}
        {!over && !cancelling && (
          <button type="button" className="a14 amut" onClick={() => setCancelling(true)}
            style={{ marginTop: 'auto', textAlign: 'center', textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>
            {tr('Cancel ride')}
          </button>
        )}
        {cancelling && (
          <div className="acard acol" style={{ padding: 16, gap: 10, marginTop: 'auto' }}>
            <label className="ab" htmlFor="why">{tr('Why are you cancelling?')}</label>
            <select id="why" className="afield" value={reason} onChange={(e) => setReason(e.target.value)}>
              {RIDER_CANCEL_REASONS.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
            </select>
            <div className="arow" style={{ gap: 8 }}>
              <button type="button" className="abtn abtn--ghost" onClick={() => setCancelling(false)}>{tr('Keep ride')}</button>
              <button type="button" className="abtn abtn--dark" onClick={cancel}>{tr('Cancel ride')}</button>
            </div>
          </div>
        )}
      </aside>
      <div className="ar-map">
        <MapSurface pickup={pickup} destination={drop} driver={driverAt} routePolyline={t?.planned_route_polyline ?? null} />
      </div>
    </div>
  );
}
