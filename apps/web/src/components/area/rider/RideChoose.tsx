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
import { type BookingOptions, type PayMethod, bookingOptions, className, holdCard, holdStatus, readDraft, updateDraft } from '@/lib/area/rider';
import { CardHoldSheet, type StripeSetup } from './CardHoldSheet';
import { shortPlace } from '@/lib/area/places';
import { rideBlurbKey } from '@/lib/vehicles';
import { rideGlyph } from '@/components/home/RideGlyphs';
import { LOAD_TIMEOUT_MS } from '@/lib/area/useLoad';
import { tellMeAtLaunch } from '@/lib/booking';
import { IBack, ICar, ICheck, ILock, IUser } from '../icons';
import { Skel } from '../states';
import { FareWorkings } from './FareWorkings';
import { PhoneStep } from './PhoneStep';

/** Seats per class, as the rider app shows them (lib/booking.ts). */
const SEATS: Record<string, number> = { auto: 3, mini: 4, hatchback: 4, sedan: 4, suv: 6, bike: 1 };
const TINT: Record<string, string> = { auto: 'var(--c-warn-bg)', mini: 'var(--c-green-bg)', hatchback: 'var(--c-green-bg)', sedan: 'var(--c-violet-bg)', suv: 'var(--d-steel-bg)' };
const PAY_LABEL: Record<PayMethod, string> = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', cash: 'Cash' };
/** Pay by as choice rows (14 Nov), each saying when and how the money moves. */
const PAY_NOTE: Record<PayMethod, string> = {
  cash: 'Pay the driver at the end', upi: 'Pay online at the end of the trip',
  card: 'Pay online at the end of the trip', netbanking: 'Pay online at the end of the trip',
};
/** 14 Nov (USA): no cash; the card (or Apple Pay, Google Pay) is held for the fare at booking. */
const US_PAY: Partial<Record<PayMethod, [string, string]>> = {
  card: ['Card, Apple Pay or Google Pay', 'Held now for the locked fare, charged when the trip ends'],
};
const MILE_M = 1609.344;
/** "Tell me when one's free": checked every 30 seconds while the page is open, for 10 minutes. */
const WATCH_EVERY_MS = 30_000;
const WATCH_FOR_MS = 10 * 60_000;

type Option = { type: string; quote: FareQuote | null };

/**
 * /ride/choose (rider-web-choose.html): each class with the fare the server quotes and locks for
 * it, then Book. 11 Nov: the trip comes from this tab (`?d=` is a random id, never coordinates);
 * distance and time once; minutes to a driver per class (none nearby: not bookable); how to pay,
 * defaulting to the last method; the mobile is verified once before the first booking.
 */
export function RideChoose({ guest = false }: { guest?: boolean }) {
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
  // 13 Nov: a city that has not launched yet: fares show, Book offers "Tell me when we launch".
  const [launch, setLaunch] = useState<string | null>(null);
  const [launchSaved, setLaunchSaved] = useState(false);
  const sock = useRef<RideSocket | null>(null);
  const [attempt, setAttempt] = useState(0);
  // No class has a driver nearby: re-check on a timer when the rider asks to be told (14 Nov).
  const [watching, setWatching] = useState<number | null>(null);
  // 14 Nov (USA): the card hold before booking, and Stripe's own form when it is not test mode.
  const [stripe, setStripe] = useState<StripeSetup | null>(null);
  const [testMode, setTestMode] = useState(false);
  const holdDone = useRef<((ok: boolean) => void) | null>(null);
  const [freed, setFreed] = useState(false);

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
          guest ? Promise.resolve(null) : bookingOptions(from).catch(() => null),
        ]);
        if (!live) return;
        clearTimeout(timer);
        setOptions(quotes);
        setLaunch(quotes.map((x) => x.quote?.launching?.message).find(Boolean) ?? null);
        setExtra(opts);
        const methods = opts?.payment?.methods ?? ['cash'];
        setPay((p) => p ?? (draft?.pay && methods.includes(draft.pay) ? draft.pay : opts?.payment?.default ?? 'cash'));
        const bookable = (o: Option) => o.quote && o.quote.drivers_nearby !== false;
        // The class chosen before signing in comes back chosen.
        const kept = quotes.find((o) => o.type === draft?.pick && bookable(o))?.type;
        setPicked((p) => (p && quotes.some((o) => o.type === p && bookable(o)) ? p : kept ?? quotes.find(bookable)?.type ?? null));
      } catch {
        if (live) { setOptions([]); setError(tr('We could not load fares. Try again.')); }
      }
    })();
    return () => { live = false; clearTimeout(timer); sock.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.get('d'), attempt]);

  const nobody = (o: Option) => o.quote?.drivers_nearby === false;
  const noneFree = !!options && !launch && options.some((o) => o.quote) && options.every((o) => !o.quote || nobody(o));
  useEffect(() => {
    if (watching === null) return;
    if (!noneFree) {
      // A driver came free while we watched: say so; the picked class is ready to book.
      setWatching(null);
      setFreed(true);
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(tr('A driver is free now'), { body: tr('Your fare is ready. Book before it changes.') });
        }
        navigator.vibrate?.(200);
      } catch { /* the line on the page says it too */ }
      return;
    }
    if (Date.now() - watching > WATCH_FOR_MS) { setWatching(null); return; }
    const t = window.setTimeout(() => setAttempt((n) => n + 1), WATCH_EVERY_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, noneFree, options]);

  function watchForDriver() {
    setFreed(false);
    setWatching(Date.now());
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
    } catch { /* not offered in this browser */ }
  }

  /** Sign-in for a visitor, coming back to this trip with the choice kept. */
  function signInHere(why: string | null) {
    const id = q.get('d') ?? '';
    if (id) updateDraft(id, { pick: chosen?.type ?? picked, pay });
    const next = encodeURIComponent(`/ride/choose?d=${id}`);
    router.push(`/sign-in?${why ? `why=${why}&` : ''}next=${next}`);
  }
  const chosen = options?.find((o) => o.type === picked && !nobody(o)) ?? null;
  const chosenFare = chosen?.quote ? money(chosen.quote.estimated_fare, chosen.quote.currency, locale) : null;
  // How long the quote holds, as the server issued it; nothing when it says nothing.
  const exp = chosen?.quote?.quote_expires_at ? Date.parse(chosen.quote.quote_expires_at) : NaN;
  const holdMin = Number.isFinite(exp) && exp > Date.now() ? Math.max(1, Math.round((exp - Date.now()) / 60000)) : null;
  const miles = options?.some((o) => o.quote?.distance_unit === 'mi') ?? false;
  const distance = route ? (miles ? `${(route.distanceMeters / MILE_M).toFixed(1)} mi` : route.distanceText) : null;
  const tripLine = route ? [distance, route.durationText].filter(Boolean).join(' · ') : null;
  const us = country === 'US';

  /** The card hold for the locked fare (USA): its id, or null when the rider stopped. */
  async function holdForBooking(): Promise<number | null> {
    const quoteId = chosen?.quote?.quote_id;
    if (!quoteId) { setError(tr('This fare has expired. Get a new one.')); return null; }
    let hold;
    try { hold = await holdCard(quoteId); } catch (e) {
      setError((e as { message?: string })?.message || tr('Card payment is not available right now.'));
      return null;
    }
    if (hold.test_mode || hold.status === 'authorised') { setTestMode(hold.test_mode); return hold.hold_id; }
    if (!hold.client_secret || !hold.publishable_key) { setError(tr('Card payment is not available right now.')); return null; }
    const ok = await new Promise<boolean>((resolve) => {
      holdDone.current = resolve;
      setStripe({ clientSecret: hold.client_secret!, publishableKey: hold.publishable_key, amount: hold.amount, currency: hold.currency });
    });
    setStripe(null);
    if (!ok) return null;
    for (let i = 0; i < 10; i += 1) {
      const st = await holdStatus(hold.hold_id).catch(() => null);
      if (st?.status === 'authorised') return hold.hold_id;
      await new Promise((r) => setTimeout(r, 800));
    }
    setError(tr('We could not confirm your card. Try again.'));
    return null;
  }

  async function book(phoneDone = false) {
    if (!from || !to || !draft || !chosen?.quote) return;
    // 14 Nov: a visitor sees the fares; signing in is asked only at Book, and comes back here.
    if (guest) { signInHere('book'); return; }
    if (extra?.phone_required && !phoneDone) { setAskPhone(true); return; }
    setBusy(true);
    setError(null);
    let cardHoldId: number | null = null;
    if (us && pay === 'card') {
      cardHoldId = await holdForBooking();
      if (cardHoldId === null) { setBusy(false); return; }
    }
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
      } else if (e.type === 'error' && e.code === 'CITY_NOT_LIVE') {
        s.close();
        setBusy(false);
        setLaunch((e.message as string) || tr('SaaradhiGo is not available in this area yet.'));
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
        ...(cardHoldId ? { card_hold_id: cardHoldId } : {}),
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
  const methods = extra?.payment?.methods ?? ['cash'];
  const fromShort = draft.from.short || shortPlace(draft.from.label);
  const toShort = draft.to.short || shortPlace(draft.to.label);
  return (
    <div className="ar-split ar-split--choose">
      <aside className="ar-panel">
        <div className="arow" style={{ gap: 8 }}>
          <Link href="/ride" className="aico" aria-label={tr('Back')}><IBack /></Link>
          <h1 className="a28">{tr('Choose a ride')}</h1>
        </div>
        {/* One line for the route (14 Nov): "Cyber Towers → Charminar · 18.8 km · 32 min". */}
        <div className="acard acol a-wide" style={{ padding: '14px 16px', gap: 8 }} title={`${draft.from.label} → ${draft.to.label}`}>
          <div className="arow" style={{ gap: 10 }}><span className="adot adot--on" aria-hidden="true" /><span>{fromShort}</span></div>
          <div className="arow" style={{ gap: 10 }}><span className="adot" style={{ background: 'var(--c-text)', borderRadius: 2 }} aria-hidden="true" /><span>{toShort}</span></div>
          {tripLine && <div className="a14 amut">{tripLine}</div>}
        </div>
        <p className="achoose__route a-phone" title={`${draft.from.label} → ${draft.to.label}`}>
          <span className="ab" data-testid="choose-pickup">{fromShort}</span>
          {' → '}
          <span className="ab" data-testid="choose-drop">{toShort}</span>
          {tripLine && <span className="amut" data-testid="trip-line"> · {tripLine}</span>}
        </p>
        <div className="acol" style={{ gap: 8 }} role="radiogroup" aria-label={tr('Choose a ride')}>
          {options === null && [0, 1, 2].map((i) => <Skel key={i} h={72} />)}
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
            const glyph = rideGlyph(rideBlurbKey(o.type));
            return (
              <button key={o.type} type="button" role="radio" aria-checked={on} disabled={!usable}
                onClick={() => setPicked(o.type)} className="achoice" data-on={on ? 'true' : undefined}
                data-testid={`class-${o.type}`}>
                <span className="aico achoice__glyph" style={{ background: TINT[o.type.toLowerCase()] ?? 'var(--c-muted)' }}>
                  {glyph ?? <ICar />}
                </span>
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
                {on && <span className="achoice__tick" aria-hidden="true"><ICheck size={14} /></span>}
              </button>
            );
          })}
        </div>
        {noneFree && (
          <div className="anote acol" style={{ alignItems: 'stretch', gap: 10 }} data-testid="no-drivers" role="status">
            <p className="ab">{tr('No drivers nearby right now')}</p>
            <p className="a14">{watching !== null
              ? tr('We are checking every 30 seconds while this page is open, for 10 minutes. Keep it open and we will tell you.')
              : tr('Drivers come free all the time. Try again in a minute, or we can keep checking for you.')}</p>
            <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="abtn abtn--ghost" onClick={() => setAttempt((n) => n + 1)} data-testid="retry-drivers">
                {tr('Try again')}
              </button>
              {watching === null && (
                <button type="button" className="abtn abtn--dark" onClick={watchForDriver} data-testid="watch-drivers">
                  {tr("Tell me when one's free")}
                </button>
              )}
            </div>
          </div>
        )}
        {freed && !noneFree && <p className="a14 agrn ab" role="status" data-testid="driver-free">{tr('A driver is free now. Your fare is ready to book.')}</p>}
        {(extra || guest) && <fieldset className="acol" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
          <legend className="albl">{tr('Pay by')}</legend>
          <div className="acol" style={{ gap: 8 }} role="radiogroup" aria-label={tr('Pay by')}>
            {methods.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={pay === m} data-testid={`pay-${m}`}
                className="achoice achoice--pay" data-on={pay === m ? 'true' : undefined} onClick={() => setPay(m)}>
                <span className="agrow">
                  <span className="ab">{tr(us && US_PAY[m] ? US_PAY[m]![0] : PAY_LABEL[m])}</span>
                  <span className="amut"> · {tr(us && US_PAY[m] ? US_PAY[m]![1] : PAY_NOTE[m])}</span>
                </span>
                {pay === m && <span className="achoice__tick" aria-hidden="true"><ICheck size={14} /></span>}
              </button>
            ))}
          </div>
          {pay && pay !== 'cash' && !us && <p className="a14 amut">{tr('You pay the locked fare online at the end of the trip. If it fails, you can try again or pay cash.')}</p>}
          {us && <p className="a14 amut">{tr('Cash is not accepted here. Your card is held for the locked fare and charged only when the trip ends.')}</p>}
          {testMode && <p className="a14 ab" role="status" data-testid="test-card">{tr('Test payment: no card is charged.')}</p>}
        </fieldset>}
        <div className="arow a14 agrn" style={{ gap: 8, padding: '10px 12px', borderRadius: 12, background: 'var(--c-green-bg)' }}>
          <ILock size={16} />{tr('The fare you book is the fare you pay.')}
          {holdMin !== null && <> {tr('Held for {n} minutes.').replace('{n}', `${holdMin}`)}</>}
        </div>
        {chosen?.quote ? <FareWorkings quote={chosen.quote} /> : null}
        {error && <p className="a14 ared" role="alert">{error}</p>}
        {/* Book stays in reach on a phone (14 Nov): sticky at the bottom, above the safe area. */}
        <div className="achoose__go">
          {launch ? (
            <div className="acol" style={{ gap: 8 }} data-testid="launching">
              <p className="ab" role="status">{launch}</p>
              {launchSaved
                ? <p className="a14 agrn" role="status">{tr("We'll tell you when we launch.")}</p>
                : (
                  <button type="button" className="abtn abtn--pri abtn--block" data-testid="tell-me"
                    onClick={() => {
                      if (guest) { signInHere(null); return; }
                      if (from) {
                        tellMeAtLaunch({ lat: from.lat, lng: from.lng })
                          .then(() => setLaunchSaved(true))
                          .catch(() => setError(tr('We could not save that. Please try again.')));
                      }
                    }}>
                    {tr('Tell me when we launch')}
                  </button>
                )}
            </div>
          ) : noneFree ? null : (
            <button type="button" className="abtn abtn--pri abtn--block"
              disabled={!chosenFare || busy} onClick={() => book()} data-testid="book">
              {busy ? tr('Booking…') : chosenFare ? `${tr('Book')} ${className(chosen?.type)} · ${chosenFare}` : tr('Book')}
            </button>
          )}
        </div>
      </aside>
      <div className="ar-map">
        <MapSurface pickup={from} destination={to} routePolyline={route?.points ?? null} />
      </div>
      {stripe && <CardHoldSheet setup={stripe} onDone={(ok) => holdDone.current?.(ok)} />}
      {askPhone && (
        <PhoneStep country={country} onClose={() => setAskPhone(false)}
          onDone={() => { setAskPhone(false); setExtra((x) => (x ? { ...x, phone_required: false } : x)); setTimeout(() => book(true), 0); }} />
      )}
    </div>
  );
}
