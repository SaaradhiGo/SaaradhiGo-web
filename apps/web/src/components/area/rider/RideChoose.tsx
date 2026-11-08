'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MapSurface from '@/components/MapSurface';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  type FareQuote, type LatLng, type RouteLine, RideSocket, type SocketEvent, type VehicleCategory,
  quoteFare, routeBetween, serviceabilityAt,
} from '@/lib/booking';
import { money } from '@/lib/area/format';
import { className } from '@/lib/area/rider';
import { IBack, ICar, ILock, IUser } from '../icons';

function point(v: string | null): LatLng | null {
  const [lat, lng] = (v ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Seats per class, as the rider app shows them (lib/booking.ts). */
const SEATS: Record<string, number> = { auto: 3, mini: 4, hatchback: 4, sedan: 4, suv: 6, bike: 1 };
const TINT: Record<string, string> = { auto: 'var(--c-warn-bg)', mini: 'var(--c-green-bg)', hatchback: 'var(--c-green-bg)', sedan: 'var(--c-violet-bg)', suv: 'var(--d-steel-bg)' };

type Option = { type: string; quote: FareQuote | null };

/**
 * /ride/choose (rider-web-choose.html): each class with the fare the server
 * quotes and locks for it, then Book. The trip is requested over the same
 * dispatch socket the booking page uses.
 */
export function RideChoose() {
  const tr = useTr();
  const { locale } = useLocale();
  const router = useRouter();
  const q = useSearchParams();
  const from = point(q.get('from'));
  const to = point(q.get('to'));
  const toLabel = q.get('tl') ?? '';
  const [route, setRoute] = useState<RouteLine | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sock = useRef<RideSocket | null>(null);

  useEffect(() => {
    if (!from || !to) return;
    let live = true;
    (async () => {
      try {
        const [area, line] = await Promise.all([serviceabilityAt(from), routeBetween(from, to).catch(() => null)]);
        if (!live) return;
        setRoute(line);
        if (!area.serviceable) { setOptions([]); setError(tr('Rides are not available at this pickup yet.')); return; }
        const km = line ? line.distanceMeters / 1000 : 0;
        const min = line ? Math.max(1, Math.round(line.durationSeconds / 60)) : 0;
        const quotes = await Promise.all(area.vehicle_types.map(async (v: VehicleCategory) => ({
          type: v.type,
          quote: await quoteFare({ pickup: from, destination: to, distanceKm: km, durationMin: min, vehicleType: v.type }).catch(() => null),
        })));
        if (!live) return;
        setOptions(quotes);
        const first = quotes.find((o) => o.quote);
        setPicked((p) => p ?? first?.type ?? null);
      } catch {
        if (live) { setOptions([]); setError(tr('We could not load fares. Try again.')); }
      }
    })();
    return () => { live = false; sock.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.get('from'), q.get('to')]);

  const chosen = options?.find((o) => o.type === picked) ?? null;
  const chosenFare = chosen?.quote ? money(chosen.quote.estimated_fare, chosen.quote.currency, locale) : null;
  // How long the quote holds, as the server issued it; nothing when it says nothing.
  const exp = chosen?.quote?.quote_expires_at ? Date.parse(chosen.quote.quote_expires_at) : NaN;
  const holdMin = Number.isFinite(exp) && exp > Date.now() ? Math.max(1, Math.round((exp - Date.now()) / 60000)) : null;

  function book() {
    if (!from || !to || !chosen?.quote) return;
    setBusy(true);
    setError(null);
    const s = new RideSocket('/ws/ride/request/', (e: SocketEvent) => {
      const id = (e.trip_id ?? e.id) as number | string | undefined;
      if ((e.type === 'trip_created' || e.type === 'current_trip') && id) {
        s.close();
        router.replace(`/ride/trip/${id}`);
      } else if (e.type === 'error' && e.code === 'QUOTE_EXPIRED' && e.fresh_quote) {
        // Nothing was booked: show the new fare and let the rider book again.
        s.close();
        const fresh = e.fresh_quote as FareQuote;
        setOptions((all) => all?.map((o) => (o.type === chosen.type ? { ...o, quote: fresh } : o)) ?? all);
        setBusy(false);
        setError(tr('The fare changed. Book again at the new fare.'));
      } else if (e.type === 'dispatch_failed' || e.type === 'error') {
        setBusy(false);
        setError((e.message as string) || tr('The server refused the request.'));
      }
    }, () => {});
    sock.current = s;
    s.open();
    const started = Date.now();
    const tick = window.setInterval(() => {
      const sent = s.send({
        action: 'request',
        pickup_lat: from.lat, pickup_lng: from.lng, destination_lat: to.lat, destination_lng: to.lng,
        pickup_address: tr('Current location'),
        destination_address: toLabel || `${to.lat}, ${to.lng}`,
        distance_km: route ? route.distanceMeters / 1000 : 0,
        duration_min: route ? Math.max(1, Math.round(route.durationSeconds / 60)) : 1,
        vehicle_type: chosen.type,
        payment_method: 'cash',
        // Books at exactly the quoted fare while the quote holds.
        ...(chosen.quote?.quote_id ? { quote_id: chosen.quote.quote_id } : {}),
      });
      if (sent) window.clearInterval(tick);
      else if (Date.now() - started > 15000) {
        window.clearInterval(tick);
        setBusy(false);
        setError(tr('We could not reach the dispatch service. Please try again.'));
      }
    }, 300);
  }

  return (
    <div className="ar-split">
      <aside className="ar-panel">
        <div className="arow" style={{ gap: 8 }}>
          <Link href="/ride" className="aico" aria-label={tr('Back')}><IBack /></Link>
          <h1 className="a28">{tr('Choose a ride')}</h1>
        </div>
        <div className="acard acol" style={{ padding: '14px 16px', gap: 8 }}>
          <div className="arow" style={{ gap: 10 }}><span className="adot adot--on" aria-hidden="true" /><span>{tr('Current location')}</span></div>
          <div className="arow" style={{ gap: 10 }}><span className="adot" style={{ background: 'var(--c-text)', borderRadius: 2 }} aria-hidden="true" /><span>{toLabel}</span></div>
        </div>
        <div className="acol" style={{ gap: 8 }} role="radiogroup" aria-label={tr('Choose a ride')}>
          {options === null && <p className="amut">{tr('Getting fares…')}</p>}
          {options?.map((o) => {
            const fare = o.quote ? money(o.quote.estimated_fare, o.quote.currency, locale) : null;
            const on = o.type === picked;
            const seats = SEATS[o.type.toLowerCase()];
            return (
              <button key={o.type} type="button" role="radio" aria-checked={on} disabled={!fare}
                onClick={() => setPicked(o.type)} className="arow"
                style={{ padding: 14, borderRadius: 14, border: on ? '2px solid var(--c-text)' : '1px solid var(--c-border)', background: 'var(--c-surface)', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: fare ? 'pointer' : 'default' }}>
                <span className="aico" style={{ width: 48, height: 48, background: TINT[o.type.toLowerCase()] ?? 'var(--c-muted)' }}><ICar /></span>
                <span className="agrow">
                  <span className="ab" style={{ display: 'block' }}>{className(o.type)}</span>
                  {seats && <span className="a14 amut arow" style={{ gap: 10 }}><IUser size={14} />{seats} {tr('seats')}</span>}
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="a20" style={{ display: 'block' }}>{fare ?? tr('No fare')}</span>
                  {fare && <span className="arow a14 agrn" style={{ gap: 4, justifyContent: 'flex-end' }}><ILock size={14} />{tr('Locked')}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="arow a14 agrn" style={{ gap: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--c-green-bg)' }}>
          <ILock size={16} />{tr('The fare you book is the fare you pay.')}
          {holdMin !== null && <> {tr('Held for {n} minutes.').replace('{n}', `${holdMin}`)}</>}
        </div>
        {error && <p className="a14 ared" role="alert">{error}</p>}
        <button type="button" className="abtn abtn--pri abtn--block" style={{ marginTop: 'auto' }}
          disabled={!chosenFare || busy} onClick={book}>
          {busy ? tr('Booking…') : chosenFare ? `${tr('Book')} ${className(chosen?.type)} · ${chosenFare}` : tr('Book')}
        </button>
      </aside>
      <div className="ar-map">
        <MapSurface pickup={from} destination={to} routePolyline={route?.points ?? null} />
      </div>
    </div>
  );
}
