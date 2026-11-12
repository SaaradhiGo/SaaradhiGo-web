'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MapSurface from '@/components/MapSurface';
import { TripSafety } from '@/components/booking/TripSafety';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import {
  CANCEL_BEFORE_DRIVER, CANCEL_WITH_DRIVER, type CancelPreview, RideSocket, type SocketEvent, cancelPreview, cancelTrip,
  formatPlate, routeBetween,
} from '@/lib/booking';
import { money } from '@/lib/area/format';
import { AREA_FLAGS } from '@/lib/area/flags';
import {
  type Call, type Eta, type Share, type Trip, className, endCall, lockedFare, startCall, startShare, stopShare,
  saveDraft, trip as loadTrip, tripDriver, tripEta, tripShare,
} from '@/lib/area/rider';
import { PayOnline } from './PayOnline';
import { ILock, IPhone, IShare, IShield, IUser } from '../icons';

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
  const [costs, setCosts] = useState<CancelPreview | null>(null);
  useEffect(() => {
    if (!cancelling) return;
    let live = true;
    cancelPreview(id).then((p) => { if (live) setCosts(p); }).catch(() => { if (live) setCosts(null); });
    return () => { live = false; };
  }, [cancelling, id]);
  // Nothing preselected (11 Nov); the reasons follow the trip state.
  const [reason, setReason] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState(false);
  const [routeLine, setRouteLine] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [paid, setPaid] = useState<'online' | 'cash' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [eta, setEta] = useState<Eta | null>(null);
  const [shareState, setShareState] = useState<Share | null>(null);
  const [call, setCall] = useState<Call | null>(null);
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
    if (AREA_FLAGS.pickupEta) tripEta(id).then(setEta).catch(() => setEta(null));
    if (AREA_FLAGS.shareLink) tripShare(id).then(setShareState).catch(() => {});
  }, [id]);

  useEffect(() => {
    refresh();
    const s = new RideSocket(`/ws/ride/trip/${id}/`, (e: SocketEvent) => {
      if (e.type === 'connection_established' && e.otp != null && `${e.otp}` !== '') setCode(`${e.otp}`);
      if (e.type === 'driver_location_update') {
        const lat = Number(e.lat); const lng = Number(e.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) setDriverAt({ lat, lng });
      }
      // The arrival estimate, every 15 s while the trip is active; null hides the line.
      if (e.type === 'trip_eta_update' && AREA_FLAGS.pickupEta) setEta((e.eta as Eta | null) ?? null);
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

  const searching = ['requested', 'pending', 'searching'].includes(state);
  useEffect(() => {
    if (!searching) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [searching]);

  const words = statusWords(state);
  // Never 0 and never a guess: no estimate, no line.
  const etaMin = eta?.phase === 'to_pickup' ? eta.pickup_eta_min : eta?.phase === 'to_drop' ? eta.drop_eta_min : null;
  const arrive = eta?.phase === 'to_drop' && eta.arrive_at
    ? new Date(eta.arrive_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : null;
  const etaLine = OVER.includes(state) || !etaMin ? null
    : eta?.phase === 'to_pickup' ? tr('Arriving in {n} min').replace('{n}', String(etaMin))
      : arrive ? tr('Arrive about {time}').replace('{time}', arrive) : null;
  const over = OVER.includes(state);
  const v = t?.vehicle_info ?? null;
  const plate = v?.vehicle_number ? formatPlate(v.vehicle_number) : null;
  const car = [v?.color, [v?.brand, v?.model].filter(Boolean).join(' ')].filter(Boolean).join(' ');
  const ride = className(v?.type ?? t?.requested_vehicle_type);
  const fare = t ? money(lockedFare(t), t.currency, locale) : null;
  const pickup = t && Number.isFinite(Number(t.pickup_lat)) ? { lat: Number(t.pickup_lat), lng: Number(t.pickup_long) } : null;
  const drop = t && Number.isFinite(Number(t.destination_lat)) ? { lat: Number(t.destination_lat), lng: Number(t.destination_long) } : null;
  const noDriver = state === 'cancelled' && t?.cancellation_reason === 'no_driver_accepted';
  const assigned = Boolean(t?.driver_name) || !searching;
  const reasons = assigned ? CANCEL_WITH_DRIVER : CANCEL_BEFORE_DRIVER;
  // How far the driver search has got, against the city's search time (11 Nov).
  const searchEnd = t?.search_expires_at ? Date.parse(t.search_expires_at) : NaN;
  const searchStart = t?.requested_at ? Date.parse(t.requested_at) : NaN;
  const searchShare = Number.isFinite(searchEnd) && Number.isFinite(searchStart) && searchEnd > searchStart
    ? Math.min(1, Math.max(0, (now - searchStart) / (searchEnd - searchStart))) : null;
  const pkey = pickup && drop ? [pickup.lat, pickup.lng, drop.lat, drop.lng].join(',') : '';
  useEffect(() => {
    // The route line on the finding and trip screens: the planned route, else one route call.
    if (!pickup || !drop || t?.planned_route_polyline || routeLine) return;
    routeBetween(pickup, drop).then((r) => setRouteLine(r?.points ?? null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkey, t?.planned_route_polyline]);

  /** Try again after "No drivers nearby": the same trip, back to the fares. */
  function rebook() {
    if (!t || !pickup || !drop) { router.push('/ride'); return; }
    const d = saveDraft({ from: { ...pickup, label: t.pickup_address ?? '' }, to: { ...drop, label: t.destination_address ?? '' } });
    router.push('/ride/choose?d=' + d);
  }

  /** Share the trip's live link (the system share sheet, else copy). */
  async function share() {
    try {
      const sh = shareState?.active ? shareState : await startShare(id);
      setShareState(sh);
      if (!sh.url) return;
      try {
        if (navigator.share) { await navigator.share({ title: tr('Follow my ride'), url: sh.url }); return; }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
      try {
        await navigator.clipboard.writeText(sh.url);
        setNote(tr('Trip link copied. Paste it to share.'));
      } catch {
        setNote(sh.url);
      }
    } catch {
      setNote(tr('We could not share this trip. Try again.'));
    }
  }

  async function unshare() {
    try { setShareState(await stopShare(id)); setNote(tr('Sharing stopped. The link no longer works.')); }
    catch { setNote(tr('We could not stop sharing. Try again.')); }
  }

  async function callDriver() {
    try {
      setCall(await startCall(id));
    } catch {
      setNote(tr('Calling is not available right now.'));
    }
  }

  function hangUp() {
    if (call) endCall(call.session_id).catch(() => {});
    setCall(null);
  }

  async function cancel() {
    if (!reason) { setReasonError(true); return; }
    try {
      await cancelTrip(id, reason);
      setCancelling(false);
      setState('cancelled');
      // "I feel unsafe" cancels AND opens the safety options: SOS, share trip, call support.
      if (reason === 'safety') setSafety(true);
    } catch {
      setNote(tr('We could not cancel this ride. Try again.'));
    }
  }

  return (
    <div className="ar-split">
      <aside className="ar-panel">
        <div>
          <span className={`apill ${state === 'cancelled' ? 'apill--neu' : 'apill--ok'}`}>{tr(words.pill)}</span>
          <h1 className="a28" style={{ marginTop: 12 }}>{noDriver ? tr('No drivers nearby right now') : tr(words.head)}</h1>
          {searching && (
            <div className="acol" style={{ gap: 6, marginTop: 8 }} data-testid="finding">
              <p className="a16" aria-live="polite">{tr('Looking for drivers near you…')}</p>
              {searchShare !== null && (
                <div role="progressbar" aria-label={tr('Driver search')} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.round(searchShare * 100)} style={{ height: 6, borderRadius: 3, background: 'var(--c-border)', overflow: 'hidden' }}>
                  <div style={{ width: (searchShare * 100) + '%', height: '100%', background: 'var(--c-accent)', transition: 'width 1s linear' }} />
                </div>
              )}
              <p className="a14 amut">{tr('You can cancel for free while we look.')}</p>
            </div>
          )}
          {noDriver && <p className="amut" style={{ marginTop: 4 }}>{tr('Nobody accepted in time. You were not charged.')}</p>}
          {etaLine && <p className="a16 ab" aria-live="polite" style={{ marginTop: 4 }}>{etaLine}</p>}
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
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${AREA_FLAGS.callDriver ? 3 : 2}, 1fr)`, gap: 8 }}>
              {AREA_FLAGS.callDriver && (
                <button type="button" className="abtn abtn--ghost a14" onClick={callDriver}><IPhone size={18} />{tr('Call')}</button>
              )}
              <button type="button" className="abtn abtn--ghost a14" onClick={share}><IShare size={18} />{tr('Share')}</button>
              <button type="button" className="abtn abtn--ghost a14" style={{ color: 'var(--c-red)' }} onClick={() => setSafety(!safety)}>
                <IShield size={18} />{tr('Safety')}
              </button>
            </div>
          </div>
        )}
        {shareState?.active && !over && (
          <div className="arow" style={{ justifyContent: 'space-between', gap: 8 }}>
            <span className="a14 amut">{tr('Sharing this trip')}</span>
            <button type="button" className="a14 ab aacc" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}
              onClick={unshare}>{tr('Stop sharing')}</button>
          </div>
        )}
        {call && (
          <div className="acard acol" style={{ padding: 16, gap: 10 }} role="dialog" aria-label={tr('Call your driver')}>
            <div className="ab">{tr('Call your driver')}</div>
            <div className="a14 amut">{tr('Dial this number. Your numbers stay private on both sides.')}</div>
            {call.number && <div className="a28" style={{ userSelect: 'all' }}>{call.number}</div>}
            <div className="arow" style={{ gap: 8 }}>
              {call.number && <a className="abtn abtn--pri agrow" href={`tel:${call.number}`}><IPhone size={18} />{tr('Call')}</a>}
              <button type="button" className="abtn abtn--ghost" onClick={hangUp}>{tr('Done')}</button>
            </div>
          </div>
        )}
        {safety && (
          <div className="site">
            <TripSafety tripId={id} driverName={t?.driver_name} plate={plate} pickupLabel={t?.pickup_address}
              destinationLabel={t?.destination_address} position={driverAt} pickup={pickup}
              onShare={AREA_FLAGS.shareLink ? share : undefined} />
          </div>
        )}

        {t && (
          <div className="acard acol" style={{ padding: '14px 16px', gap: 8 }}>
            <div className="arow" style={{ justifyContent: 'space-between' }}>
              <span className="ab">{ride}</span>
              <span className="arow" style={{ gap: 8 }}>
                {fare && <span className="a20">{fare}</span>}
                {fare && state !== 'cancelled' && <span className="apill apill--ok"><ILock size={14} />{tr('Locked')}</span>}
                {state === 'cancelled' && (costs && !costs.free && costs.fee && t.cancelled_by === 'rider'
                  ? <span className="apill apill--warn">{tr('Fee {fee} on your next ride').replace('{fee}', money(costs.fee, costs.currency, locale) ?? '')}</span>
                  : <span className="apill apill--neu" data-testid="no-charge">{tr('No charge')}</span>)}
              </span>
            </div>
            {t.destination_address && <div className="a14 amut">{tr('To')} {t.destination_address}</div>}
            {fare && t.payment_method === 'cash' && !over && (
              <div className="a14 amut">{tr('Pay {fare} in cash to your driver at the end.').replace('{fare}', fare)}</div>
            )}
          </div>
        )}
        {note && <p className="a14 amut" role="status">{note}</p>}

        {state === 'completed' && t && fare && !paid && ['upi', 'card'].includes(t.payment_method ?? '') && t.payment_status !== 'completed' ? (
          <PayOnline tripId={id} fare={fare} method={t.payment_method ?? 'upi'} onPaid={(how) => { setPaid(how); refresh(); }} />
        ) : state === 'completed' ? (
          <>
            {paid === 'cash' && <p className="a14 amut">{tr('Pay {fare} in cash to your driver.').replace('{fare}', fare ?? '')}</p>}
            <Link href={`/trips/${id}`} className="abtn abtn--pri abtn--block">{tr('See your receipt')}</Link>
          </>
        ) : null}
        {noDriver ? (
          <div className="arow" style={{ gap: 8 }}>
            <button type="button" className="abtn abtn--ghost" onClick={() => router.push('/ride')}>{tr('Back')}</button>
            <button type="button" className="abtn abtn--pri agrow" onClick={rebook} data-testid="try-again">{tr('Try again')}</button>
          </div>
        ) : state === 'cancelled' && (
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
            {costs && (costs.free ? (
              <p className="a14 agrn" style={{ margin: 0 }}>
                {costs.free_until
                  ? tr('Free to cancel until {time}.').replace('{time}', new Date(costs.free_until).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }))
                  : tr('Free to cancel.')}
              </p>
            ) : (
              <p className="a14" style={{ margin: 0 }}>
                {tr('Cancelling now costs {fee}. It is added to your next ride. No fee if you cancel because you feel unsafe.')
                  .replace('{fee}', money(costs.fee, costs.currency, locale) ?? '')}
              </p>
            ))}
            <fieldset className="acol" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}
              aria-describedby={reasonError ? 'why-err' : undefined}>
              <legend className="ab">{tr('Why are you cancelling?')}</legend>
              {reasons.map((r) => (
                <label key={r.value} className="arow a14" style={{ gap: 8, cursor: 'pointer' }}>
                  <input type="radio" name="why" value={r.value} checked={reason === r.value}
                    onChange={() => { setReason(r.value); setReasonError(false); }} />
                  {tr(r.label)}
                </label>
              ))}
            </fieldset>
            {reasonError && <p id="why-err" className="a14 ared">{tr('Choose a reason.')}</p>}
            {reason === 'safety' && <p className="a14 amut">{tr('We will also open the safety options: SOS, share your trip and call support.')}</p>}
            <div className="arow" style={{ gap: 8 }}>
              <button type="button" className="abtn abtn--ghost" onClick={() => setCancelling(false)}>{tr('Keep ride')}</button>
              <button type="button" className="abtn abtn--dark" onClick={cancel}>{tr('Cancel ride')}</button>
            </div>
          </div>
        )}
      </aside>
      <div className="ar-map">
        <MapSurface pickup={pickup} destination={drop} driver={driverAt} routePolyline={t?.planned_route_polyline ?? routeLine}>
          {etaLine && etaMin ? <span className="amaplabel">{tr('{n} min').replace('{n}', String(etaMin))}</span> : null}
        </MapSurface>
      </div>
    </div>
  );
}
