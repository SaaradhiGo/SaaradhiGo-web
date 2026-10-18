'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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

export default function BookPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupLabel, setPickupLabel] = useState('');
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [destinationLabel, setDestinationLabel] = useState('');

  const [service, setService] = useState<Serviceability | null>(null);
  const [vehicleType, setVehicleType] = useState('');
  const [quote, setQuote] = useState<FareQuote | null>(null);

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

  async function getQuote() {
    if (!pickup || !destination || !vehicleType) return;
    setBusy(true);
    setError(null);
    try {
      const km = haversineKm(pickup, destination);
      const q = await quoteFare({
        pickup,
        destination,
        distanceKm: km,
        durationMin: Math.max(1, Math.round(km * 3)),
        vehicleType,
      });
      setQuote(q);
      setStage('choose');
    } catch (err) {
      setError(
        messageFor(err, 'We could not price this trip. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

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
          if (status === 'completed' || status === 'cancelled') {
            setStage('done');
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
    <div className="max-w-2xl mx-auto">
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
              <Alert kind="info">
                Destination search is unavailable on this deployment: the maps
                service is not configured. This is a configuration gap, not a
                fault in your account.
              </Alert>
              <div className="rounded-xl border border-amber-800/40 bg-amber-900/15 p-3">
                <p className="text-xs uppercase tracking-widest text-amber-200/80">
                  QA test entry
                </p>
                <Field
                  label="Destination coordinates"
                  name="manualDest"
                  placeholder="16.5190, 80.6305"
                  value={manualDest}
                  onChange={(e) => setManualDest(e.target.value)}
                  help="Latitude and longitude. Available because maps search is not configured here."
                />
                <button
                  type="button"
                  className="btn-secondary mt-3"
                  onClick={setManualDestination}
                >
                  Use these coordinates
                </button>
              </div>
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
              <div className="grid gap-2 sm:grid-cols-2">
                {service.vehicle_types.map((v) => (
                  <button
                    key={v.type}
                    type="button"
                    onClick={() => {
                      setVehicleType(v.type);
                      setQuote(null);
                    }}
                    aria-pressed={vehicleType === v.type}
                    className={`text-left rounded-xl border px-4 py-3 transition-colors duration-150 ${
                      vehicleType === v.type
                        ? 'border-brand bg-brand/10'
                        : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-medium capitalize">{v.type}</span>
                    {v.description && (
                      <span className="block text-xs text-white/55">
                        {v.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={getQuote}
                disabled={busy || !vehicleType}
              >
                {busy ? 'Pricing…' : 'Get fare estimate'}
              </button>

              {quote && (
                <div className="rounded-xl border border-white/10 p-4">
                  <p className="text-2xl font-bold">
                    {money(quote.estimated_fare)}
                  </p>
                  <p className="text-xs text-white/55 mt-1">
                    Estimated. The final fare is confirmed at the end of the
                    trip.
                  </p>
                </div>
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
  );
}
