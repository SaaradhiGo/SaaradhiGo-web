'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import MapSurface from '@/components/MapSurface';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  type FareQuote, type RouteLine, RideSocket, type SocketEvent, type VehicleCategory,
  quoteFare, routeBetween, serviceabilityAt,
} from '@/lib/booking';
import { money } from '@/lib/area/format';
import { type BookingOptions, type PayMethod, bookingOptions, className, readDraft } from '@/lib/area/rider';
import { LOAD_TIMEOUT_MS } from '@/lib/area/useLoad';
import { IBack, ICar, ICard, ILock, IUser } from '../icons';
import { Skel } from '../states';
import { FareWorkings } from './FareWorkings';
import { PhoneStep } from './PhoneStep';

/** Seats per class, as the rider app shows them (lib/booking.ts). */
const SEATS: Record<string, number> = { auto: 3, mini: 4, hatchback: 4, sedan: 4, suv: 6, bike: 1 };
const TINT: Record<string, string> = { auto: 'var(--c-warn-bg)', mini: 'var(--c-green-bg)', hatchback: 'var(--c-green-bg)', sedan: 'var(--c-violet-bg)', suv: 'var(--d-steel-bg)' };
const PAY_LABEL: Record<PayMethod, string> = { upi: 'UPI', card: 'Card', cash: 'Cash' };

type Option = { type: string; quote: FareQuote | null };

/**
 * /ride/choose (rider-web-choose.html): each class with the fare the server quotes and locks for
 * it, then Book. 11 Nov: the trip comes from this tab (`?d=` is a random id, never coordinates);
 * distance and time once; minutes to a driver per class (none nearby: not bookable); how to pay,
 * defaulting to the last method; the mobile is verified once before the first booking.
 */
export function RideChoose() {
  const tr = useTr();
  const { locale } = useLocale();
  const router = useRouter();
  const q = useSearchParams();
  const draft = readDraft(q.get('d'));
  const from = draft ? { lat: draft.from.lat, lng: draft.from.lng } : null;
  const to = draft ? { lat: draft.to.lat, lng: draft.to.lng } : null;
  const [route, setRoute] = useState<RouteLine | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [extra, setExtra] = useState<BookingOptions | null>(null);
  const [country, setCountry] = useState('IN');
  const [picked, setPicked] = useState<string | null>(null);
  const [pay, setPay] = useState<PayMethod | null>(null);
  const [askPhone, setAskPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sock = useRef<RideSocket | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { if (!draft) router.replace('/ride'); }, [draft, router]);

  useEffect(() => {
    if (!from || !to) return;
    let live = true;
    setOptions(null);
    setError(null);
    // Never "Getting fares…" for ever (8 Nov): ten seconds, then an error with Try again.
    const timer = setTimeout(() => {
      if (live) { live = false; setOptions([]); setError(tr('We could not load fares. Try again.')); }
    }, LOAD_TIMEOUT_MS);
    (async () => {
      try {
        const [area, line] = await Promise.all([serviceabilityAt(from), routeBetween(from, to).catch(() => null)]);
        if (!live) return;
        setRoute(line);
        if (area.zone?.country) setCountry(area.zone.country);
        if (!area.serviceable) { setOptions([]); setError(tr('Rides are not available at this pickup yet.')); return; }
        const km = line ? line.distanceMeters / 1000 : 0;
        const min = line ? Math.max(1, Math.round(line.durationSeconds / 60)) : 0;
        const types = area.vehicle_types.map((v: VehicleCategory) => v.type);
        const [quotes, opts] = await Promise.all([
          Promise.all(types.map(async (type) => ({
            type,
            quote: await quoteFare({ pickup: from, destination: to, distanceKm: km, durationMin: min, vehicleType: type }).catch(() => null),
          }))),
          bookingOptions(from).catch(() => null),
        ]);
        if (!live) return;
        clearTimeout(timer);
        setOptions(quotes);
        setExtra(opts);
        setPay((p) => p ?? opts?.payment.default ?? 'cash');
        const bookable = (o: Option) => o.quote && o.quote.drivers_nearby !== false;
        setPicked((p) => p ?? quotes.find(bookable)?.type ?? null);
      } catch {
        if (live) { setOptions([]); setError(tr('We could not load fares. Try again.')); }
      }
    })();
    return () => { live = false; clearTimeout(timer); sock.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.get('d'), attempt]);

  const nobody = (o: Option) => o.quote?.drivers_nearby === false;
  const chosen = options?.find((o) => o.type === picked && !nobody(o)) ?? null;
  const chosenFare = chosen?.quote ? money(chosen.quote.estimated_fare, chosen.quote.currency, locale) : null;
  // How long the quote holds, as the server issued it; nothing when it says nothing.
  const exp = chosen?.quote?.quote_expires_at ? Date.parse(chosen.quote.quote_expires_at) : NaN;
  const holdMin = Number.isFinite(exp) && exp > Date.now() ? Math.max(1, Math.round((exp - Date.now()) / 60000)) : null;
  const tripLine = route ? [route.distanceText, route.durationText].filter(Boolean).join(' · ') : null;

  function book(phoneDone = false) {
    if (!from || !to || !draft || !chosen?.quote) return;
    if (extra?.phone_required && !phoneDone) { setAskPhone(true); return; }
    setBusy(true);
    setError(null);
    const s = new RideSocket('/ws/ride/request/', (e: SocketEvent) => {
      const id = (e.trip_id ?? e.id) as number | string | undefined;
      if ((e.type === 'trip_created' || e.type === 'current_trip') && id) {
        s.close();
        router.replace(`/ride/trip/${id}`);
      } else if (e.type === 'error' && e.code === 'PHONE_VERIFICATION_REQUIRED') {
        s.close();
        setBusy(false);
        setAskPhone(true);
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
        pickup_address: draft.from.label,
        destination_address: draft.to.label,
        distance_km: route ? route.distanceMeters / 1000 : 0,
        duration_min: route ? Math.max(1, Math.round(route.durationSeconds / 60)) : 1,
        vehicle_type: chosen.type,
        payment_method: pay ?? 'cash',
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

  if (!draft) return null;
  const methods = extra?.payment.methods ?? ['cash'];
  return (
    <div className="ar-split">
      <aside className="ar-panel">
        <div className="arow" style={{ gap: 8 }}>
          <Link href="/ride" className="aico" aria-label={tr('Back')}><IBack /></Link>
          <h1 className="a28">{tr('Choose a ride')}</h1>
        </div>
        <div className="acard acol" style={{ padding: '14px 16px', gap: 8 }}>
          <div className="arow" style={{ gap: 10 }}><span className="adot adot--on" aria-hidden="true" /><span data-testid="choose-pickup">{draft.from.label}</span></div>
          <div className="arow" style={{ gap: 10 }}><span className="adot" style={{ background: 'var(--c-text)', borderRadius: 2 }} aria-hidden="true" /><span>{draft.to.label}</span></div>
          {tripLine ? <div className="a14 amut" data-testid="trip-line">{tripLine}</div> : options === null ? <Skel h={16} w={140} /> : null}
        </div>
        <div className="acol" style={{ gap: 8 }} role="radiogroup" aria-label={tr('Choose a ride')}>
          {options === null && [0, 1, 2].map((i) => <Skel key={i} h={64} />)}
          {options?.length === 0 && error && (
            <button type="button" className="abtn abtn--ghost" onClick={() => setAttempt((n) => n + 1)}>{tr('Try again')}</button>
          )}
          {options?.map((o) => {
            const fare = o.quote ? money(o.quote.estimated_fare, o.quote.currency, locale) : null;
            const none = nobody(o);
            const mins = none ? null : o.quote?.pickup_eta_min;
            const usable = Boolean(fare) && !none;
            const on = usable && o.type === picked;
            const seats = SEATS[o.type.toLowerCase()];
            return (
              <button key={o.type} type="button" role="radio" aria-checked={on} disabled={!usable}
                onClick={() => setPicked(o.type)} className="arow" data-testid={`class-${o.type}`}
                style={{ padding: 14, borderRadius: 14, border: on ? '2px solid var(--c-text)' : '1px solid var(--c-border)', background: 'var(--c-surface)', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: usable ? 'pointer' : 'default', opacity: none ? 0.6 : 1 }}>
                <span className="aico" style={{ width: 48, height: 48, background: TINT[o.type.toLowerCase()] ?? 'var(--c-muted)' }}><ICar /></span>
                <span className="agrow">
                  <span className="ab" style={{ display: 'block' }}>
                    {className(o.type)}
                    {typeof mins === 'number' && <span className="amut" style={{ fontWeight: 400 }}> · {tr('{n} min away').replace('{n}', String(mins))}</span>}
                  </span>
                  {none ? <span className="a14 amut">{tr('No drivers nearby')}</span>
                    : seats ? <span className="a14 amut arow" style={{ gap: 10 }}><IUser size={14} />{seats} {tr('seats')}</span> : null}
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="a20" style={{ display: 'block' }}>{fare ?? tr('No fare')}</span>
                  {fare && !none && <span className="arow a14 agrn" style={{ gap: 4, justifyContent: 'flex-end' }}><ILock size={14} />{tr('Locked')}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {extra && (
          <fieldset className="acol" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
            <legend className="albl">{tr('Pay by')}</legend>
            <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label={tr('Pay by')}>
              {methods.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={pay === m} data-testid={`pay-${m}`}
                  className={`achip${pay === m ? ' achip--on' : ''}`} onClick={() => setPay(m)}>
                  <ICard size={16} />{tr(PAY_LABEL[m])}
                </button>
              ))}
            </div>
            {pay && pay !== 'cash' && <p className="a14 amut">{tr('You pay the locked fare online at the end of the trip. If it fails, you can try again or pay cash.')}</p>}
          </fieldset>
        )}
        <div className="arow a14 agrn" style={{ gap: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--c-green-bg)' }}>
          <ILock size={16} />{tr('The fare you book is the fare you pay.')}
          {holdMin !== null && <> {tr('Held for {n} minutes.').replace('{n}', `${holdMin}`)}</>}
        </div>
        {chosen?.quote ? <FareWorkings quote={chosen.quote} /> : null}
        {error && <p className="a14 ared" role="alert">{error}</p>}
        <button type="button" className="abtn abtn--pri abtn--block" style={{ marginTop: 'auto' }}
          disabled={!chosenFare || busy} onClick={() => book()} data-testid="book">
          {busy ? tr('Booking…') : chosenFare ? `${tr('Book')} ${className(chosen?.type)} · ${chosenFare}` : tr('Book')}
        </button>
      </aside>
      <div className="ar-map">
        <MapSurface pickup={from} destination={to} routePolyline={route?.points ?? null} />
      </div>
      {askPhone && (
        <PhoneStep country={country} onClose={() => setAskPhone(false)}
          onDone={() => { setAskPhone(false); setExtra((x) => (x ? { ...x, phone_required: false } : x)); setTimeout(() => book(true), 0); }} />
      )}
    </div>
  );
}
