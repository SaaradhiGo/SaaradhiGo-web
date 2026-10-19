'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import {
  FareQuote,
  LatLng,
  Place,
  RIDER_CANCEL_REASONS,
  RideSocket,
  Serviceability,
  SocketEvent,
  cancelTrip,
  haversineKm,
  isMapsUnavailable,
  placeToPoint,
  quoteFare,
  searchPlaces,
  serviceabilityAt,
} from '@/lib/booking';
import MapSurface from '@/components/MapSurface';
import { messageFor, readRiderToken } from '@/lib/publicAuth';

/**
 * Book a ride in the browser.
 *
 * WHAT IS REAL HERE
 * Every number on this page came from the server: the categories are the
 * ones with an active rate card in the rider's zone, the fare is the
 * server's quote with its own currency and distance unit, and the trip is
 * created by the same WebSocket dispatch the Android app uses. Nothing is
 * simulated, and there is no fallback that invents a driver, a price or an
 * ETA when something is missing.
 *
 * WHEN MAPS IS NOT CONFIGURED
 * Destination search is the one step that needs an external key. Without it
 * the proxy answers 502 API_ERROR, and this page says so and offers a
 * clearly-labelled QA entry by coordinates. It never pretends to have found
 * a place.
 */
type Stage = 'where' | 'choose' | 'requesting' | 'matched' | 'done';

function BookPageInner() {
  const params = useSearchParams();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupLabel, setPickupLabel] = useState('');
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationLabel, setDestinationLabel] = useState('');

  const [service, setService] = useState<Serviceability | null>(null);
  const [vehicleType, setVehicleType] = useState('');
  const [quote, setQuote] = useState<FareQuote | null>(null);
  // One quote per category, so the rider can compare. `null` means that
  // category could not be priced -- never a guessed number.
  const [quotes, setQuotes] = useState<Record<string, FareQuote | null>>({});

  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapsDown, setMapsDown] = useState(false);
  const [manualDest, setManualDest] = useState('');

  const [stage, setStage] = useState<Stage>('where');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tripId, setTripId] = useState<number | string | null>(null);
  const [tripState, setTripState] = useState<string>('');
  const [driver, setDriver] = useState<Record<string, unknown> | null>(null);
  // The pickup PIN the driver must be told before the trip can start. The
  // server broadcasts it on `accept`; this page used to drop it on the floor,
  // so a rider on the website had no way to start their ride.
  const [pickupOtp, setPickupOtp] = useState<string | null>(null);
  const [socketState, setSocketState] =
    useState<'connecting' | 'open' | 'closed'>('closed');
  const [cancelReason, setCancelReason] = useState<string>(
    RIDER_CANCEL_REASONS[4].value,
  );

  const requestSocket = useRef<RideSocket | null>(null);
  const tripSocket = useRef<RideSocket | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(readRiderToken()));
  }, []);


  useEffect(
    () => () => {
      requestSocket.current?.close();
      tripSocket.current?.close();
    },
    [],
  );

  // --- pickup ------------------------------------------------------------

  const loadServiceability = useCallback(async (point: LatLng) => {
    setError(null);
    try {
      const s = await serviceabilityAt(point);
      setService(s);
      if (s.vehicle_types.length > 0) setVehicleType(s.vehicle_types[0].type);
    } catch (err) {
      setError(messageFor(err, 'We could not check this pickup point.'));
    }
  }, []);

  // Carried from the booking panel on the homepage, so the two screens are
  // one journey rather than two forms asking the same question.
  useEffect(() => {
    const parse = (v: string | null) => {
      if (!v) return null;
      const [a, b] = v.split(',').map((s) => Number(s.trim()));
      return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
    };
    const p = parse(params.get('pickup'));
    if (p) {
      setPickup(p);
      setPickupLabel(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      void loadServiceability(p);
    }
    const d = parse(params.get('dest'));
    if (d) {
      setDestination(d);
      setDestinationLabel(`${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`);
    }
    const q = params.get('q');
    if (q) setQuery(q);
  }, [params, loadServiceability]);

  function useMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError('This browser cannot share your location. Enter it below.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPickup(p);
        setPickupLabel('My current location');
        void loadServiceability(p);
        setBusy(false);
      },
      () => {
        setBusy(false);
        setError(
          'We could not read your location. Allow location access, or enter a pickup point below.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function setManualPickup(value: string) {
    const [latS, lngS] = value.split(',').map((s) => s.trim());
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Enter the pickup as "latitude, longitude".');
      return;
    }
    const p = { lat, lng };
    setPickup(p);
    setPickupLabel(`${lat}, ${lng}`);
    void loadServiceability(p);
  }

  // --- destination -------------------------------------------------------

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPlaces([]);
    if (!query.trim()) return;
    setBusy(true);
    try {
      const found = await searchPlaces(query.trim());
      setPlaces(found);
      if (found.length === 0) setNotice('No places matched that search.');
    } catch (err) {
      if (isMapsUnavailable(err)) {
        setMapsDown(true);
      } else {
        setError(messageFor(err, 'Destination search failed.'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function choosePlace(place: Place) {
    setBusy(true);
    setError(null);
    try {
      const point = await placeToPoint(place.place_id);
      if (!point) {
        setError('We could not resolve that place to a location.');
        return;
      }
      setDestination(point);
      setDestinationLabel(place.description);
      setPlaces([]);
    } catch (err) {
      if (isMapsUnavailable(err)) setMapsDown(true);
      else setError(messageFor(err, 'We could not resolve that place.'));
    } finally {
      setBusy(false);
    }
  }

  function setManualDestination() {
    const [latS, lngS] = manualDest.split(',').map((s) => s.trim());
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Enter the destination as "latitude, longitude".');
      return;
    }
    setDestination({ lat, lng });
    setDestinationLabel(`${lat}, ${lng}`);
  }

  // --- quote -------------------------------------------------------------

  /**
   * Price EVERY category the zone offers, so the rider compares instead of
   * picking blind and then discovering the number.
   *
   * One quote per category, each a real `/ride/estimate-fare/` call -- the
   * server prices every one of them. A category whose quote fails is shown
   * as unavailable rather than given a guessed or interpolated price: there
   * is no arithmetic here that turns one category's fare into another's.
   */
  const quoteAll = useCallback(async () => {
    if (!pickup || !destination || !service?.vehicle_types?.length) return;
    setBusy(true);
    setError(null);

    const km = haversineKm(pickup, destination);
    const durationMin = Math.max(1, Math.round(km * 3));

    const entries = await Promise.all(
      service.vehicle_types.map(async (v) => {
        try {
          const q = await quoteFare({
            pickup,
            destination,
            distanceKm: km,
            durationMin,
            vehicleType: v.type,
          });
          return [v.type, q] as const;
        } catch {
          return [v.type, null] as const;
        }
      }),
    );

    const next: Record<string, FareQuote | null> = {};
    for (const [type, q] of entries) next[type] = q;
    setQuotes(next);

    const priced = entries.filter(([, q]) => q !== null);
    if (priced.length === 0) {
      setError('We could not price this trip. Please try again.');
    } else {
      // Preselect the cheapest priced option, and show its quote.
      const cheapest = priced.reduce((a, b) =>
        Number(a[1]!.estimated_fare) <= Number(b[1]!.estimated_fare) ? a : b,
      );
      setVehicleType((current) => current || cheapest[0]);
      setQuote((current) => current ?? cheapest[1]);
      setStage('choose');
    }
    setBusy(false);
  }, [pickup, destination, service]);

  // --- request -----------------------------------------------------------

  function requestRide() {
    if (!pickup || !destination || !vehicleType) return;
    setError(null);
    setStage('requesting');

    const sock = new RideSocket(
      '/ws/ride/request/',
      (event: SocketEvent) => {
        if (event.type === 'trip_created') {
          const id = (event.trip_id ?? event.id) as number | string;
          setTripId(id);
          setTripState('requested');
          setStage('matched');
          openTripSocket(id);
        } else if (event.type === 'current_trip') {
          const id = (event.trip_id ?? event.id) as number | string | undefined;
          if (id) {
            setTripId(id);
            setStage('matched');
            openTripSocket(id);
          }
        } else if (event.type === 'dispatch_failed') {
          setStage('where');
          setError(
            (event.message as string) ||
              'No driver accepted this trip. Try again in a moment.',
          );
        } else if (event.type === 'error') {
          setStage('where');
          setError((event.message as string) || 'The server refused the request.');
        }
      },
      setSocketState,
    );
    requestSocket.current = sock;
    sock.open();

    // The socket must be open before the request frame is sent.
    const started = Date.now();
    const tick = window.setInterval(() => {
      if (
        sock.send({
          action: 'request',
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          destination_lat: destination.lat,
          destination_lng: destination.lng,
          pickup_address: pickupLabel || `${pickup.lat}, ${pickup.lng}`,
          destination_address:
            destinationLabel || `${destination.lat}, ${destination.lng}`,
          distance_km: haversineKm(pickup, destination),
          duration_min: Math.max(1, Math.round(haversineKm(pickup, destination) * 3)),
          vehicle_type: vehicleType,
          payment_method: 'cash',
        })
      ) {
        window.clearInterval(tick);
      } else if (Date.now() - started > 15000) {
        window.clearInterval(tick);
        setStage('where');
        setError('We could not reach the dispatch service. Please try again.');
      }
    }, 300);
  }

  function openTripSocket(id: number | string) {
    tripSocket.current?.close();
    const sock = new RideSocket(
      `/ws/ride/trip/${id}/`,
      (event: SocketEvent) => {
        // The greeting carries the PIN for a rider whose trip is already
        // assigned -- a reload, a dropped socket, or a second tab. Without
        // this the PIN was visible only to a client that happened to be
        // connected at the instant the driver accepted.
        if (event.type === 'connection_established') {
          const greetOtp = event.otp as string | number | undefined;
          if (greetOtp !== undefined && greetOtp !== null
              && `${greetOtp}`.trim() !== '') {
            setPickupOtp(`${greetOtp}`.trim());
          }
          const greetStatus = event.trip_status as string | undefined;
          if (greetStatus) setTripState(greetStatus);
        }

        if (
          event.type === 'trip_update' ||
          event.type === 'trip_status_update'
        ) {
          const status =
            (event.status as string) ||
            ((event.trip as Record<string, unknown>)?.status as string);
          if (status) setTripState(status);
          const d =
            (event.driver as Record<string, unknown>) ??
            ((event.trip as Record<string, unknown>)?.driver as Record<
              string,
              unknown
            >);
          if (d) setDriver(d);

          // The OTP arrives with the accept broadcast, either at the top
          // level or inside `trip`. Keep whichever we are given, and never
          // clear it on a later event that simply does not repeat it.
          const otp =
            (event.otp as string | number | undefined) ??
            ((event.trip as Record<string, unknown>)?.otp as
              | string
              | number
              | undefined);
          if (otp !== undefined && otp !== null && `${otp}`.trim() !== '') {
            setPickupOtp(`${otp}`.trim());
          }

          if (status === 'completed' || status === 'cancelled') {
            setStage('done');
            setPickupOtp(null);
          }
        }
      },
      setSocketState,
    );
    tripSocket.current = sock;
    sock.open();
  }

  async function doCancel() {
    if (!tripId) return;
    setBusy(true);
    setError(null);
    try {
      await cancelTrip(tripId, cancelReason);
      setTripState('cancelled');
      setStage('done');
    } catch (err) {
      // The trip is still live if the server did not confirm. Say so.
      setError(
        messageFor(
          err,
          'We could not cancel. Your ride may still be on its way — try again.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  // --- render ------------------------------------------------------------

  if (signedIn === null) {
    return <p className="text-white/60">Loading…</p>;
  }

  if (!signedIn) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold">Book a ride</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">Sign in to book a ride.</Alert>
          <Link href="/sign-in" className="btn-primary w-full">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn-secondary w-full">
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  const money = (amount: string) =>
    `${quote?.currency ? `${quote.currency} ` : ''}${amount}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-10 items-start">
      <div className="min-w-0">
      <h1 className="text-3xl font-bold">Book a ride</h1>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <Alert kind="info">{notice}</Alert>
        </div>
      )}

      {/* ---------------- pickup ---------------- */}
      <section className="card mt-6 space-y-4">
        <h2 className="text-xl font-semibold">1. Pickup</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={useMyLocation}
            disabled={busy}
          >
            Use my location
          </button>
        </div>
        <Field
          label="Or enter a pickup point"
          name="pickup"
          placeholder="16.5062, 80.6480"
          help='Latitude and longitude, separated by a comma.'
          onBlur={(e) => e.target.value && setManualPickup(e.target.value)}
        />
        {pickup && (
          <p className="text-sm text-white/70">
            Pickup: <strong>{pickupLabel}</strong>
          </p>
        )}

        {service && !service.serviceable && (
          <Alert kind="info">
            We do not operate at that pickup point yet. Try another location.
          </Alert>
        )}
        {service?.serviceable && service.zone && (
          <p className="text-sm text-white/60">
            {service.zone.name} · prices in {service.zone.currency} · distances
            in {service.zone.distance_unit}
          </p>
        )}
      </section>

      {/* ---------------- destination ---------------- */}
      {service?.serviceable && (
        <section className="card mt-5 space-y-4">
          <h2 className="text-xl font-semibold">2. Destination</h2>

          {!mapsDown ? (
            <form onSubmit={runSearch} className="space-y-3" noValidate>
              <Field
                label="Search for a destination"
                name="q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="btn-secondary" disabled={busy}>
                {busy ? 'Searching…' : 'Search'}
              </button>
            </form>
          ) : (
            <>
              {/* The blocked state is the ANSWER here, stated plainly and
                  on its own. Destination search needs a map provider and
                  this deployment has none. */}
              <div className="rounded-xl border border-amber-700/40 bg-amber-900/15 p-4">
                <p className="font-medium text-amber-100">
                  Destination search is unavailable
                </p>
                <p className="mt-1.5 text-sm text-amber-100/70">
                  This deployment has no map provider configured, so we cannot
                  look up addresses. This is a configuration gap on our side,
                  not a problem with your account. Everything else -- fares,
                  booking and trip tracking -- works.
                </p>
              </div>

              {/* QA entry by coordinates. Deliberately collapsed and
                  labelled: it is a testing affordance, and presenting it as
                  the normal way to choose a destination would be presenting
                  a broken product as a finished one. */}
              <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm text-white/55 hover:text-white/80 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                  QA testing: enter a destination by coordinates
                </summary>
                <div className="border-t border-white/[0.07] p-4">
                  <Field
                    label="Destination coordinates"
                    name="manualDest"
                    placeholder="16.5190, 80.6305"
                    value={manualDest}
                    onChange={(e) => setManualDest(e.target.value)}
                    help="Latitude and longitude. For testing only, while map search is unconfigured."
                  />
                  <button
                    type="button"
                    className="btn-secondary mt-3"
                    onClick={setManualDestination}
                  >
                    Use these coordinates
                  </button>
                </div>
              </details>
            </>
          )}

          {places.length > 0 && (
            <ul className="divide-y divide-white/5">
              {places.map((p) => (
                <li key={p.place_id}>
                  <button
                    type="button"
                    className="w-full text-left py-3 hover:text-brand"
                    onClick={() => choosePlace(p)}
                  >
                    {p.description}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {destination && (
            <p className="text-sm text-white/70">
              Destination: <strong>{destinationLabel}</strong>
            </p>
          )}
        </section>
      )}

      {/* ---------------- vehicle + fare ---------------- */}
      {service?.serviceable && destination && (
        <section className="card mt-5 space-y-4">
          <h2 className="text-xl font-semibold">3. Vehicle and fare</h2>

          {service.vehicle_types.length === 0 ? (
            <Alert kind="info">
              No vehicle categories are available at this pickup point yet.
            </Alert>
          ) : (
            <>
              {/* Every category is priced by the server before the rider
                  chooses, so this is a comparison rather than a guess
                  followed by a reveal. A category the server could not
                  price says so; nothing here interpolates a fare. */}
              {Object.keys(quotes).length === 0 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={quoteAll}
                  disabled={busy}
                >
                  {busy ? 'Pricing…' : 'Show fares'}
                </button>
              )}

              <ul className="grid gap-2.5 sm:grid-cols-2">
                {service.vehicle_types.map((v) => {
                  const q = quotes[v.type];
                  const priced = q !== undefined && q !== null;
                  const unavailable = q === null;
                  const selected = vehicleType === v.type;
                  return (
                    <li key={v.type}>
                      <button
                        type="button"
                        disabled={unavailable}
                        onClick={() => {
                          setVehicleType(v.type);
                          if (priced) setQuote(q);
                        }}
                        aria-pressed={selected}
                        className={`w-full text-left rounded-xl border px-4 py-3.5 transition-colors duration-150 flex items-center justify-between gap-4 ${
                          selected
                            ? 'border-brand bg-brand/10'
                            : unavailable
                              ? 'border-white/5 opacity-50 cursor-not-allowed'
                              : 'border-white/10 hover:bg-white/5'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="font-medium capitalize block">
                            {v.type}
                          </span>
                          {v.description && (
                            <span className="block text-xs text-white/55">
                              {v.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          {priced ? (
                            <span className="font-semibold tabular-nums">
                              {money(q.estimated_fare)}
                            </span>
                          ) : unavailable ? (
                            <span className="text-xs text-white/45">
                              Unavailable
                            </span>
                          ) : (
                            <span className="text-xs text-white/40">—</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {quote && (
                <p className="text-xs text-white/55">
                  Estimated. The final fare is confirmed at the end of the
                  trip.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* ---------------- request ---------------- */}
      {quote && stage !== 'matched' && stage !== 'done' && (
        <section className="card mt-5 space-y-3">
          <h2 className="text-xl font-semibold">4. Confirm</h2>
          <p className="text-sm text-white/60">
            You will pay the driver in cash at the end of this trip.
          </p>
          <SubmitButton
            busy={stage === 'requesting'}
            busyLabel="Finding you a driver…"
            onClick={requestRide}
            type="button"
          >
            Request this ride
          </SubmitButton>
          {stage === 'requesting' && (
            <p className="text-sm text-white/60" role="status">
              Dispatch connection: {socketState}
            </p>
          )}
        </section>
      )}

      {/* ---------------- live trip ---------------- */}
      {stage === 'matched' && (
        <section className="card mt-5 space-y-4">
          <h2 className="text-xl font-semibold">Your ride</h2>
          <p className="text-sm">
            Trip <strong>#{tripId}</strong> · status{' '}
            <strong>{tripState || 'requested'}</strong>
          </p>
          <p className="text-xs text-white/50">Live updates: {socketState}</p>

          {/* The pickup PIN.
              The driver cannot start the trip without it, and this page
              never showed it -- the server broadcasts it on accept and the
              client dropped it, so a rider booking on the website had no way
              to begin their ride. It is only useful between the driver being
              assigned and the trip starting, so it is shown exactly then. */}
          {pickupOtp && tripState !== 'in_progress' ? (
            <div className="rounded-xl border border-brand/40 bg-brand/10 p-4">
              <p className="text-xs uppercase tracking-widest text-brand">
                Pickup PIN
              </p>
              <p className="mt-1 text-3xl font-bold tracking-[0.3em] tabular-nums">
                {pickupOtp}
              </p>
              <p className="mt-1 text-xs text-white/60">
                Give this to your driver to start the trip. Do not share it
                with anyone else.
              </p>
            </div>
          ) : null}

          {driver ? (
            <div className="rounded-xl border border-white/10 p-4 text-sm">
              <p className="font-medium">
                {(driver.name as string) ?? 'Your driver'}
              </p>
              {driver.vehicle_number ? (
                <p className="text-white/60">
                  {String(driver.vehicle_number)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-white/60">
              Waiting for a driver to accept.
            </p>
          )}

          <div className="border-t border-white/5 pt-4 space-y-3">
            <label htmlFor="cancel-reason" className="label">
              Need to cancel?
            </label>
            <select
              id="cancel-reason"
              className="input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            >
              {RIDER_CANCEL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={doCancel}
              disabled={busy}
            >
              {busy ? 'Cancelling…' : 'Cancel this ride'}
            </button>
          </div>
        </section>
      )}

      {stage === 'done' && (
        <section className="card mt-5 space-y-3">
          <h2 className="text-xl font-semibold">
            {tripState === 'cancelled' ? 'Ride cancelled' : 'Trip complete'}
          </h2>
          {tripState !== 'cancelled' && (
            <p className="text-sm text-white/70">
              Pay the driver in cash. Your receipt is emailed once they confirm
              they have collected it.
            </p>
          )}
          <Link href="/my-trips" className="btn-secondary inline-flex">
            See your trips
          </Link>
        </section>
      )}

      <p className="mt-8 text-sm text-white/50">
        Need help?{' '}
        <Link href="/contact" className="text-brand hover:underline">
          Contact support
        </Link>
      </p>
      </div>

      {/* The journey so far, kept in view while the steps scroll. Every
          value here is one the server returned. */}
      <aside className="hidden lg:block lg:sticky lg:top-24 space-y-4">
        <MapSurface
          className="h-64"
          zoneName={service?.zone?.name}
          currency={service?.zone?.currency}
          vehicleCount={service?.vehicle_types?.length ?? null}
        />

        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Your journey
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-white/45">Pickup</dt>
              <dd className="mt-0.5 font-medium break-words">
                {pickup ? pickupLabel : <span className="text-white/35">Not set</span>}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Destination</dt>
              <dd className="mt-0.5 font-medium break-words">
                {destination ? destinationLabel : <span className="text-white/35">Not set</span>}
              </dd>
            </div>
            <div>
              <dt className="text-white/45">Vehicle</dt>
              <dd className="mt-0.5 font-medium capitalize">
                {vehicleType || <span className="text-white/35">Not chosen</span>}
              </dd>
            </div>
          </dl>

          {quote && (
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <p className="text-xs text-white/45">Estimated fare</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {money(quote.estimated_fare)}
              </p>
              <p className="mt-1 text-xs text-white/45">
                Confirmed at the end of the trip.
              </p>
            </div>
          )}

          {tripId && (
            <div className="mt-4 border-t border-white/[0.07] pt-4">
              <p className="text-xs text-white/45">Trip</p>
              <p className="mt-1 font-semibold">#{tripId}</p>
              <p className="mt-0.5 text-sm text-white/60">{tripState || 'requested'}</p>
              <p className="mt-1 text-xs text-white/40">Live updates: {socketState}</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function BookPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<p className="text-white/60">Loading…</p>}>
      <BookPageInner />
    </Suspense>
  );
}
