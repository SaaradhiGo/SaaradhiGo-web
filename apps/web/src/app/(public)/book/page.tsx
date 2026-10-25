'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  rideHistory,
  routeBetween,
  searchPlaces,
  serviceabilityAt,
} from '@/lib/booking';
import MapSurface from '@/components/MapSurface';
import { GuestCheckout } from '@/components/booking/GuestCheckout';
import { messageFor, readRiderToken } from '@/lib/publicAuth';
import { formatDistance, formatFare } from '@/lib/money';
import { publicRideName, vehicleClassLabel } from '@/lib/vehicles';
import { Badge } from '@/components/sg/Badge';
import { Button, ButtonLink } from '@/components/sg/Button';
import { DriverCard, initialsFor } from '@/components/sg/DriverCard';
import { FareLock, FareSummary } from '@/components/sg/FareSummary';
import { GlassPanel } from '@/components/sg/GlassPanel';
import {
  LocateAction,
  LocationField,
  RouteFields,
  RouteMarker,
} from '@/components/sg/LocationField';
import { MapLabel } from '@/components/sg/MapLabel';
import { VehicleList, VehicleOption } from '@/components/sg/VehicleOption';
import { ArrowRight, Card as CardIcon, Check, Clock } from '@/components/sg/icons';

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

/**
 * What the rider's trip is actually doing.
 *
 * The socket reports the COMMAND the driver issued -- `start`, `complete`,
 * `confirm_cash` -- not the state the trip ended up in. Taken literally the
 * rider was shown "status confirm_cash", and every check written against a
 * real status silently never matched: the pickup PIN was still on screen,
 * under a Cancel button, on a ride that had already been paid for. Trip #88
 * finished with all three on display.
 *
 * So translate once, here, and let the screen ask about states.
 */
const TRIP_STATE_FROM_ACTION: Record<string, string> = {
  accept: 'accepted',
  arrive: 'reached',
  start: 'in_progress',
  complete: 'completed',
  confirm_cash: 'completed',
  cancel: 'cancelled',
};

function normaliseTripState(raw: string): string {
  const key = String(raw ?? '').trim().toLowerCase();
  return TRIP_STATE_FROM_ACTION[key] ?? key;
}

const TRIP_STATE_LABEL: Record<string, string> = {
  requested: 'finding you a driver',
  searching: 'finding you a driver',
  accepted: 'driver on the way',
  reached: 'driver is waiting at your pickup',
  in_progress: 'on the way to your destination',
  completed: 'completed',
  cancelled: 'cancelled',
};

/**
 * Send a Maps failure to the operational console, never to the page.
 *
 * The rider is told "Location search is temporarily unavailable"; this is
 * where the reason survives -- an unset key, an exhausted quota and an
 * upstream 5xx all look identical to a passenger and must not look identical
 * to us.
 */
function logMapsFailure(stage: string, err: unknown) {
  const detail =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
  console.warn(`[maps] ${stage} unavailable: ${detail}`);
}

/**
 * Which leg of the journey the rider should see drawn, for a given state.
 *
 * Before anyone is assigned, the rider is choosing a trip, so the route is
 * the trip. Once a driver is on the way the useful line is the one that
 * tells them how long until the car arrives. Once they are in it, it is the
 * trip again. After it ends there is nothing to draw.
 */
function routeLegFor(
  tripState: string,
  pickup: LatLng | null,
  destination: LatLng | null,
  driver: LatLng | null,
): { origin: LatLng; destination: LatLng } | null {
  if (TRIP_IS_OVER.includes(tripState)) return null;

  const enRouteToPickup = tripState === 'accepted' || tripState === 'reached';
  if (enRouteToPickup && driver && pickup) {
    return { origin: driver, destination: pickup };
  }
  if (pickup && destination) return { origin: pickup, destination };
  return null;
}

/**
 * A stable identity for a leg, so a moving driver does not buy a new route
 * every few seconds.
 *
 * Rounded to 3 decimal places, about 110 m. The driver has to actually make
 * progress before another request is worth making, and the server caches the
 * answer for five minutes on top of that.
 */
function routeKey(leg: { origin: LatLng; destination: LatLng } | null): string {
  if (!leg) return '';
  const r = (n: number) => n.toFixed(3);
  return `${r(leg.origin.lat)},${r(leg.origin.lng)}->`
    + `${r(leg.destination.lat)},${r(leg.destination.lng)}`;
}

/** The PIN proves the right passenger got in. After that it proves nothing. */
/**
 * Public ride names for the booking page.
 *
 * The homepage takes these from the active dictionary. The booking flow is
 * not translated yet, so it passes the English set explicitly rather than
 * rendering half a screen in one language and half in another.
 */
const BOOKING_RIDE_NAMES = {
  auto: 'Auto',
  mini: 'Mini',
  sedan: 'Sedan',
  suv: 'SUV',
} as const;

const PIN_IS_STILL_NEEDED = ['accepted', 'reached'];
const TRIP_IS_OVER = ['completed', 'cancelled'];

function BookPageInner() {
  const params = useSearchParams();
  const router = useRouter();
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
  // The pickup field searches too. It used to accept ONLY "lat, lng": a
  // rider who typed "forum mall" was told to "Enter the pickup as
  // latitude, longitude", which is a coordinate prompt on a consumer
  // booking screen. Coordinates still work, as a fallback, because they
  // are genuinely useful when a place has no name.
  const [pickupQuery, setPickupQuery] = useState('');
  const [pickupPlaces, setPickupPlaces] = useState<Place[]>([]);
  const [mapsDown, setMapsDown] = useState(false);
  const [manualDest, setManualDest] = useState('');

  const [stage, setStage] = useState<Stage>('where');
  // Pressed Confirm without a session: choose between signing in and
  // booking as a guest. See `requestRide`.
  const [identify, setIdentify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tripId, setTripId] = useState<number | string | null>(null);
  const [tripState, setTripState] = useState<string>('');
  const [driver, setDriver] = useState<Record<string, unknown> | null>(null);
  // The assigned driver's live position, straight off the trip socket.
  // Only ever a coordinate the server sent; never interpolated.
  const [driverPos, setDriverPos] =
    useState<{ lat: number; lng: number } | null>(null);
  /** The encoded polyline currently drawn, or null when there is none. */
  const [routePoints, setRoutePoints] = useState<string | null>(null);
  /** The leg that polyline belongs to, so we only refetch when it changes. */
  const drawnRouteKey = useRef<string>('');
  /** Guards against a slow response overwriting a newer one. */
  const routeRequest = useRef(0);
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

  // Rejoin a ride that is already under way.
  //
  // This page used to know about a trip only because it had just created one,
  // so a reload, a crashed tab or a second tab showed the booking form while
  // a driver was waiting at the kerb -- and the pickup PIN, which only exists
  // on this screen, was gone for good. Trip #88 died exactly that way.
  //
  // The server is the authority on whether a ride is in progress, so ask it
  // instead of trusting anything kept in the browser. Reopening the socket is
  // what recovers the PIN: the greeting carries it for a rider whose trip is
  // already assigned.
  useEffect(() => {
    if (!readRiderToken()) return;
    let cancelled = false;

    const LIVE = ['requested', 'searching', 'accepted', 'reached', 'in_progress'];

    rideHistory()
      .then((rows) => {
        if (cancelled) return;
        const active = (rows as Array<Record<string, unknown>>).find((t) =>
          LIVE.includes(String(t?.status ?? '').toLowerCase()),
        );
        if (!active?.id) return;
        setTripId(active.id as number | string);
        setTripState(normaliseTripState(String(active.status ?? '')));
        setStage('matched');

        // Rebuild what the rider is looking at from the trip itself. Without
        // this the summary beside a restored ride described the empty booking
        // form instead: destination "Not set", and the vehicle reset to the
        // cheapest category -- "Auto" next to a sedan already on its way.
        const num = (v: unknown) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };
        const pLat = num(active.pickup_lat);
        const pLng = num(active.pickup_long);
        if (pLat !== null && pLng !== null) {
          setPickup({ lat: pLat, lng: pLng });
          setPickupLabel(
            String(active.pickup_address ?? '') ||
              `${pLat.toFixed(5)}, ${pLng.toFixed(5)}`,
          );
        }
        const dLat = num(active.destination_lat);
        const dLng = num(active.destination_long);
        if (dLat !== null && dLng !== null) {
          setDestination({ lat: dLat, lng: dLng });
          setDestinationLabel(
            String(active.destination_address ?? '') ||
              `${dLat.toFixed(5)}, ${dLng.toFixed(5)}`,
          );
        }
        // What the rider ASKED for comes first: it exists from the moment
        // they book, whereas the assigned vehicle is null until a driver
        // accepts -- and was null on every trip until the server started
        // recording it.
        const vehicle =
          active.requested_vehicle_type ??
          (active.vehicle_info as Record<string, unknown> | null)?.type;
        if (typeof vehicle === 'string' && vehicle) setVehicleType(vehicle);

        openTripSocket(active.id as number | string);
      })
      .catch(() => {
        // A rider who cannot be told about an older trip should still be able
        // to book a new one, so this failure stays silent on the page.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(
    () => () => {
      requestSocket.current?.close();
      tripSocket.current?.close();
    },
    [],
  );

  // Draw the road the rider is actually going to travel.
  //
  // Keyed on the LEG, not on the driver's position: a GPS frame every few
  // seconds must not turn into a Routes request every few seconds. The key
  // rounds to ~110 m, and the server caches each answer for five minutes and
  // rate-limits per rider, so a stationary or slow-moving driver costs
  // nothing at all.
  //
  // Markers and live tracking do not depend on any of this -- if the route
  // request fails the dot still moves.
  useEffect(() => {
    const leg = routeLegFor(tripState, pickup, destination, driverPos);
    const key = routeKey(leg);

    if (!leg) {
      if (drawnRouteKey.current !== '') {
        drawnRouteKey.current = '';
        setRoutePoints(null);
      }
      return;
    }
    if (key === drawnRouteKey.current) return;

    drawnRouteKey.current = key;
    const ticket = ++routeRequest.current;

    routeBetween(leg.origin, leg.destination)
      .then((route) => {
        // A response for a leg we have already moved on from is not an
        // update, it is a stale picture of somewhere we were.
        if (ticket !== routeRequest.current) return;
        setRoutePoints(route?.points ?? null);
      })
      .catch((err) => {
        if (ticket !== routeRequest.current) return;
        // A missing route is a missing line, not a broken booking. The
        // reason goes to operations; the rider keeps their markers.
        logMapsFailure('route', err);
        setRoutePoints(null);
        // Allow a retry on the next state change rather than caching the
        // failure against this key forever.
        drawnRouteKey.current = '';
      });
  }, [tripState, pickup, destination, driverPos]);

  // --- pickup ------------------------------------------------------------

  const loadServiceability = useCallback(async (point: LatLng) => {
    setError(null);
    try {
      const s = await serviceabilityAt(point);
      setService(s);
      // Only fill a gap. This used to overwrite whatever was already
      // chosen, so re-checking the pickup point silently reset the
      // rider's vehicle to the cheapest one -- and a restored trip
      // showed "Auto" for a sedan it had already dispatched.
      if (s.vehicle_types.length > 0) {
        setVehicleType((current) => current || s.vehicle_types[0].type);
      }
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
    // The homepage sends the text the rider typed alongside the resolved
    // point. Coordinates are the fallback, not the first choice: a rider who
    // typed "Banjara Hills" should not be shown "17.38500, 78.48670" back.
    const pickupWords = params.get('pickup_label');
    const destWords = params.get('dest_label');

    const p = parse(params.get('pickup'));
    if (p) {
      setPickup(p);
      const label = pickupWords || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
      setPickupLabel(label);
      setPickupQuery(label);
      void loadServiceability(p);
    } else if (pickupWords) {
      setPickupLabel(pickupWords);
      setPickupQuery(pickupWords);
    }
    const d = parse(params.get('dest'));
    if (d) {
      setDestination(d);
      setDestinationLabel(destWords || `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}`);
    } else if (destWords) {
      setDestinationLabel(destWords);
    }
    const q = params.get('q');
    if (q) setQuery(q);
    // The vehicle class survives a sign-in round trip, so a rider who
    // pressed "Sign in to confirm Sedan" comes back to Sedan selected
    // rather than to the cheapest class.
    const chosen = params.get('class');
    if (chosen) setVehicleType(chosen);
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

  /** A pair of numbers, when someone pastes coordinates. Otherwise null. */
  function asCoordinates(value: string) {
    const [latS, lngS] = value.split(',').map((part) => part.trim());
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  async function searchPickup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPickupPlaces([]);
    const typed = pickupQuery.trim();
    if (!typed) return;

    // Coordinates first: "17.4169, 78.4387" is an address, just not a
    // searchable one, and sending it to a place search would return nothing.
    const point = asCoordinates(typed);
    if (point) {
      setPickup(point);
      setPickupLabel(`${point.lat}, ${point.lng}`);
      void loadServiceability(point);
      return;
    }

    setBusy(true);
    try {
      const found = await searchPlaces(typed);
      setPickupPlaces(found);
      if (found.length === 0) setNotice('No places matched that search.');
    } catch (err) {
      setError(messageFor(err, 'We could not search just now. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function choosePickup(place: Place) {
    setPickupPlaces([]);
    setBusy(true);
    try {
      const point = await placeToPoint(place.place_id);
      if (!point) {
        setError('We could not use that place. Please pick another.');
        return;
      }
      setPickup(point);
      setPickupLabel(place.description);
      setPickupQuery(place.description);
      void loadServiceability(point);
    } catch (err) {
      setError(messageFor(err, 'We could not use that place. Please pick another.'));
    } finally {
      setBusy(false);
    }
  }

  function setManualPickup(value: string) {
    const point = asCoordinates(value);
    if (!point) return; // typing a place name is not an error; it is a search
    const p = point;
    setPickup(p);
    setPickupLabel(`${p.lat}, ${p.lng}`);
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
        // The rider gets a short, actionable line; the provider's own
        // explanation goes to the console so operations can see WHICH
        // failure this was (no key, quota, upstream error) without it
        // being printed on a customer's screen.
        logMapsFailure('destination search', err);
        setMapsDown(true);
      } else {
        setError(messageFor(err, 'We could not search just now. Please try again.'));
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
      if (isMapsUnavailable(err)) {
        logMapsFailure('place details', err);
        setMapsDown(true);
      } else {
        setError(messageFor(err, 'We could not use that place. Please pick another.'));
      }
    } finally {
      setBusy(false);
    }
  }

  function setManualDestination() {
    const [latS, lngS] = manualDest.split(',').map((s) => s.trim());
    const lat = Number(latS);
    const lng = Number(lngS);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Search for a destination, or paste it as "latitude, longitude".');
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
      // THE FARE SHOWN MUST BE THE FARE OF THE CLASS THAT IS SELECTED.
      //
      // This used to set the vehicle to whatever was already chosen and the
      // quote to `current ?? cheapest`, independently. A rider returning
      // from sign-in with `?class=sedan` therefore kept Sedan selected and
      // was shown the AUTO fare beside it, because the quote was still null
      // and the cheapest one filled the gap. The button read "Confirm Sedan
      // · <auto's price>".
      const chosen = vehicleType && next[vehicleType] ? vehicleType : cheapest[0];
      setVehicleType(chosen);
      setQuote(next[chosen] ?? cheapest[1]);
      setStage('choose');
    }
    setBusy(false);
  }, [pickup, destination, service, vehicleType]);

  /**
   * Price the trip the moment both ends are known. No button.
   *
   * THIS USED TO BE BEHIND "SHOW FARES", and the reasoning was cost: each
   * quote makes the server fetch a route from a paid provider for every
   * vehicle class, so the page asked before spending it. That reasoning put
   * the operator's bill ahead of the one question the visitor came with.
   * Someone who has typed a pickup and a destination has asked what it
   * costs; making them ask again is an extra press for a screen that exists
   * to answer exactly that.
   *
   * The spend is bounded rather than unmetered: `signature` is the trip, so
   * a given pickup-destination-zone triple is priced ONCE per visit however
   * many times this effect re-runs, a failure is not retried in a loop, and
   * the server still caches each route for five minutes and throttles per
   * caller. Changing the destination is a new trip and a new quote, which is
   * correct -- it is a different question.
   */
  const pricedSignature = useRef<string>('');
  useEffect(() => {
    if (!pickup || !destination) return;
    if (!service?.serviceable || !service?.vehicle_types?.length) return;

    const r = (n: number) => n.toFixed(4);
    const signature =
      `${r(pickup.lat)},${r(pickup.lng)}->${r(destination.lat)},${r(destination.lng)}`
      + `@${service.zone?.name ?? ''}`;
    if (signature === pricedSignature.current) return;
    pricedSignature.current = signature;

    void quoteAll();
  }, [pickup, destination, service, quoteAll]);

  // --- request -----------------------------------------------------------

  /** The booking as a URL, so signing in can come straight back to it. */
  function bookingUrl() {
    const next = new URLSearchParams(params.toString());
    if (pickup) next.set('pickup', `${pickup.lat},${pickup.lng}`);
    if (destination) next.set('dest', `${destination.lat},${destination.lng}`);
    if (pickupLabel) next.set('pickup_label', pickupLabel);
    if (destinationLabel) next.set('dest_label', destinationLabel);
    if (vehicleType) next.set('class', vehicleType);
    return `/book?${next.toString()}`;
  }

  function requestRide() {
    if (!pickup || !destination || !vehicleType) return;

    // THE ONE PLACE A SESSION IS REQUIRED. A trip belongs to a person: the
    // driver is told who to collect, the PIN is checked against an account,
    // and the trip has to appear in someone's history. Everything before
    // this point -- searching, comparing classes, seeing the fare -- works
    // without one.
    //
    // IT USED TO SEND THEM STRAIGHT TO /sign-in, which is a demand to
    // register from someone who has already chosen their ride and seen the
    // price. Now it offers the choice it should have offered: book as a
    // guest -- name, number, a code, no password -- or sign in to an
    // account they already have. Neither leaves this page, so the trip is
    // not handed off and re-read from a URL to get back here.
    if (!readRiderToken()) {
      setIdentify(true);
      return;
    }
    setIdentify(false);

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
          if (greetStatus) setTripState(normaliseTripState(greetStatus));
        }

        // The driver moving. The consumer sends this to the RIDER only --
        // the driver is the source of its own position and does not need an
        // echo of it.
        if (event.type === 'driver_location_update') {
          const lat = Number(event.lat);
          const lng = Number(event.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setDriverPos({ lat, lng });
          }
        }

        if (
          event.type === 'trip_update' ||
          event.type === 'trip_status_update'
        ) {
          const status =
            (event.status as string) ||
            ((event.trip as Record<string, unknown>)?.status as string);
          const state = normaliseTripState(status ?? '');
          if (state) setTripState(state);
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

          if (TRIP_IS_OVER.includes(state)) {
            setStage('done');
            setPickupOtp(null);
            // No driver is on their way any more; stop showing one.
            setDriverPos(null);
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
    return (
      <div className="sg-page">
        <p className="body text-ink-muted" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // NO SIGNED-OUT GATE. A visitor who has not signed in gets the real
  // booking workspace: the map, the fields, the vehicle classes and the
  // FARES. Asking someone to create an account before telling them what a
  // ride costs asks them to commit before they know the price, which is the
  // one number they came for.
  //
  // Sign-in happens at CONFIRM -- see `requestRide` -- because that is the
  // point where a trip is actually created against a person.

  // --- presentation ------------------------------------------------------

  /**
   * What to call the trip, in the rider's words.
   *
   * The design's live-trip panel leads with "Ravi is 3 min away". The ETA is
   * not available: the trip socket carries the driver's position and the
   * trip's state, and neither the accept broadcast nor `tripDetail` returns a
   * time to arrival.
   *
   * TODO(eta): lead with the minutes once the server sends them. The Routes
   * API call the backend already makes for the route has a duration in it, so
   * this is a matter of relaying it on the accept broadcast rather than a new
   * integration. Until then the heading says what is happening, which is the
   * part we know, and never a number we would be guessing.
   */
  const driverName = typeof driver?.name === 'string' ? driver.name : null;
  const driverFirstName = driverName ? driverName.split(/\s+/)[0] : null;
  const plate = driver && driver.vehicle_number ? String(driver.vehicle_number) : null;

  function tripHeadline(): string {
    if (tripState === 'cancelled') return 'Ride cancelled';
    if (tripState === 'completed') return 'You have arrived';
    if (tripState === 'started') {
      return destinationLabel ? `On your way to ${destinationLabel}` : 'On your way';
    }
    if (tripState === 'reached') {
      return driverFirstName ? `${driverFirstName} has arrived` : 'Your Saaradhi has arrived';
    }
    if (tripState === 'accepted') {
      return driverFirstName ? `${driverFirstName} is on the way` : 'Your Saaradhi is on the way';
    }
    return 'Finding your Saaradhi';
  }

  const tripTone: 'success' | 'danger' | 'neutral' =
    tripState === 'cancelled' ? 'danger' : tripState ? 'success' : 'neutral';

  const fare = formatFare(quote?.estimated_fare, quote?.currency);
  const journeyKm = pickup && destination ? haversineKm(pickup, destination) : null;
  const bothEndsSet = Boolean(pickup && destination);

  /** Start the destination over, from the panel's "Edit trip" link. */
  function editTrip() {
    setDestination(null);
    setDestinationLabel('');
    setQuery('');
    setPlaces([]);
    setQuotes({});
    setQuote(null);
    setVehicleType('');
  }

  /** The journey recap, shown in place of the fields once both ends are known. */
  const summary = (
    <div className="sg-summary">
      <div>
        <RouteMarker kind="pickup" />
        <span className="min-w-0 truncate">{pickupLabel || 'Pickup'}</span>
        <small>Now</small>
      </div>
      <div>
        <RouteMarker kind="drop" />
        <span className="min-w-0 truncate">{destinationLabel || 'Destination'}</span>
        {/* Straight-line distance, and labelled as such by being the only
            distance on the panel. The road distance is inside the server's
            own quote and is not repeated here as though it were this one. */}
        <small className="sg-num">
          {formatDistance(journeyKm, service?.zone?.distance_unit ?? 'km') ?? ''}
        </small>
      </div>
    </div>
  );

  return (
    <div className="sg-ws">
      {/* The map: full-bleed behind the panel on a desktop, above it on a
          phone. One instance, so nothing is drawn twice and no extra tiles
          are bought. Every coordinate on it is one the server returned. */}
      <div className="sg-ws__map">
        <MapSurface
          className="h-full"
          zoneName={service?.zone?.name}
          currency={service?.zone?.currency}
          vehicleCount={service?.vehicle_types?.length ?? null}
          pickup={pickup}
          destination={destination}
          driver={driverPos}
          routePolyline={routePoints}
        >
          {/* One floating label, for the one fact worth putting on the map:
              the locked fare. It is aria-hidden, because the same number is
              in the panel beside it, in reading order. */}
          {fare && stage !== 'done' && (
            <MapLabel left="72%" top="26%">
              {destinationLabel ? `${destinationLabel.split(',')[0]} · ` : ''}
              <b className="sg-num">{fare}</b>
            </MapLabel>
          )}
        </MapSurface>
        <div className="sg-scrim-bottom md:hidden" />
      </div>

      <section className="sg-ws__panel">
        {/* The page's heading. The panels carry the visible titles, as the
            design has them, so this exists for the document outline and for
            anyone navigating by headings. */}
        <h1 className="sr-only">Book a ride</h1>

        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="info">{notice}</Alert>}

        {/* ---------------- the journey and the fare ---------------- */}
        {stage !== 'matched' && stage !== 'done' && (
          <GlassPanel
            title={bothEndsSet ? 'Choose a ride' : 'Book a ride'}
            action={
              bothEndsSet ? (
                <button type="button" className="sg-link" onClick={editTrip}>
                  Edit trip
                </button>
              ) : undefined
            }
          >
            {bothEndsSet ? (
              summary
            ) : (
              <RouteFields>
                <LocationField
                  id="bk-pickup"
                  kind="pickup"
                  label="Pickup"
                  placeholder="Where are you?"
                  value={pickupQuery}
                  autoComplete="off"
                  onChange={(e) => {
                    setPickupQuery(e.target.value);
                    setPickupPlaces([]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void searchPickup(e as unknown as React.FormEvent);
                    }
                  }}
                  onBlur={(e) => e.target.value && setManualPickup(e.target.value)}
                  action={<LocateAction onClick={useMyLocation} busy={busy} />}
                />
                <LocationField
                  id="bk-dest"
                  kind="drop"
                  label="Destination"
                  placeholder="Where to?"
                  value={query}
                  autoComplete="off"
                  disabled={!service?.serviceable}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void runSearch(e as unknown as React.FormEvent);
                    }
                  }}
                />
              </RouteFields>
            )}

            {/* The hint used to read "type a pickup as latitude, longitude",
                which was accurate when the field only parsed coordinates and
                is now simply wrong: it searches. Coordinates still work, so
                they are mentioned last, as the fallback they are. */}
            {!bothEndsSet && !pickup && (
              <p className="caption text-ink-subtle">
                Search for a place, use your location, or paste coordinates.
              </p>
            )}

            {service && !service.serviceable && (
              <Alert kind="info">
                We do not operate at that pickup point yet. Try another
                location.
              </Alert>
            )}

            {!bothEndsSet && service?.serviceable && !mapsDown && (
              <Button variant="secondary" onClick={runSearch} disabled={busy}>
                {busy ? 'Searching…' : 'Search destination'}
              </Button>
            )}

            {/* Customer-facing copy.
                This used to read "This deployment has no map provider
                configured ... a configuration gap on our side", which is a
                sentence written for us, not for the passenger standing on a
                pavement. It also invited them to conclude the whole service
                was broken. Say what it means for them, say what still works,
                and tell them what to do. The provider's actual reason is
                logged for operations, not printed on the page. */}
            {!bothEndsSet && service?.serviceable && mapsDown && (
              <>
                <div className="alert alert-info" role="status">
                  <span className="title block">
                    Location search is temporarily unavailable
                  </span>
                  <span className="caption text-ink-muted block mt-sg-1">
                    Please try again in a moment. You can still book — fares,
                    drivers and trip tracking are working normally.
                  </span>
                </div>

                {/* QA entry by coordinates. Deliberately collapsed and
                    labelled: it is a testing affordance, and presenting it as
                    the normal way to choose a destination would be presenting
                    a broken product as a finished one. */}
                <details className="group rounded-sg-md border border-line bg-bg-200">
                  <summary className="cursor-pointer list-none px-sg-4 py-sg-3 caption text-ink-muted hover:text-ink flex items-center gap-sg-2">
                    <span
                      aria-hidden="true"
                      className="transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                    QA testing: enter a destination by coordinates
                  </summary>
                  <div className="border-t border-line p-sg-4">
                    <Field
                      label="Destination coordinates"
                      name="manualDest"
                      placeholder="16.5190, 80.6305"
                      value={manualDest}
                      onChange={(e) => setManualDest(e.target.value)}
                      help="Latitude and longitude. For testing only, while map search is unconfigured."
                    />
                    <div className="mt-sg-3">
                      <Button variant="secondary" onClick={setManualDestination}>
                        Use these coordinates
                      </Button>
                    </div>
                  </div>
                </details>
              </>
            )}

            {pickupPlaces.length > 0 && (
              <div>
                {pickupPlaces.map((p) => (
                  <button
                    key={`pickup-${p.place_id}`}
                    type="button"
                    className="sg-place w-full text-left"
                    onClick={() => choosePickup(p)}
                  >
                    <span className="sg-place__icon" aria-hidden="true">
                      <Clock />
                    </span>
                    <span className="min-w-0">
                      <span className="sg-place__name block truncate">
                        {p.description.split(',')[0]}
                      </span>
                      <span className="sg-place__addr block truncate">
                        {p.description.split(',').slice(1).join(',').trim()}
                      </span>
                    </span>
                    <span />
                  </button>
                ))}
              </div>
            )}

            {places.length > 0 && (
              <div>
                {places.map((p) => (
                  <button
                    key={p.place_id}
                    type="button"
                    className="sg-place w-full text-left"
                    onClick={() => choosePlace(p)}
                  >
                    <span className="sg-place__icon" aria-hidden="true">
                      <Clock />
                    </span>
                    <span className="min-w-0">
                      <span className="sg-place__name block truncate">
                        {p.description.split(',')[0]}
                      </span>
                      <span className="sg-place__addr block truncate">
                        {p.description.split(',').slice(1).join(',').trim()}
                      </span>
                    </span>
                    <span />
                  </button>
                ))}
              </div>
            )}

            {/* ---------------- the vehicle classes ---------------- */}
            {bothEndsSet && service?.serviceable && (
              service.vehicle_types.length === 0 ? (
                <Alert kind="info">
                  No vehicle categories are available at this pickup point yet.
                </Alert>
              ) : (
                <>
                  {/* Every category is priced by the server before the rider
                      chooses, so this is a comparison rather than a guess
                      followed by a reveal. A category the server could not
                      price says so; nothing here interpolates a fare. */}
                  {/* NO "SHOW FARES" BUTTON. The prices arrive with the
                      list, because a visitor who has entered both ends of a
                      journey has already asked the question that button was
                      making them ask twice. While they are on their way the
                      row says so; it never shows a placeholder number. */}
                  {Object.keys(quotes).length === 0 && (
                    <p className="caption text-ink-muted" role="status">
                      {busy ? 'Pricing your trip…' : 'Getting fares…'}
                    </p>
                  )}
                  {Object.keys(quotes).length > 0 && (
                    <div className="flex items-center justify-between gap-sg-3">
                      <span className="caption text-ink-subtle">
                        Fares for this trip
                      </span>
                      <button
                        type="button"
                        className="sg-link"
                        onClick={quoteAll}
                        disabled={busy}
                      >
                        {busy ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>
                  )}

                  <VehicleList>
                    {service.vehicle_types.map((v) => {
                      const q = quotes[v.type];
                      const priced = q !== undefined && q !== null;
                      return (
                        <VehicleOption
                          key={v.type}
                          category={v.type}
                          name={publicRideName(v.type, BOOKING_RIDE_NAMES)}
                          /* TODO(eta, seats): the design's meta line is "5 min
                             away · 4 seats". Neither is available --
                             `/pricing/vehicle-types/` returns a category code
                             and a description, and there is no endpoint for a
                             nearby-driver ETA per class. The server's own
                             description is shown instead of a fabricated ETA. */
                          meta={v.description || null}
                          fare={
                            priced
                              ? formatFare(
                                  q.estimated_fare,
                                  q.currency ?? service.zone?.currency,
                                )
                              : null
                          }
                          selected={vehicleType === v.type}
                          onSelect={() => {
                            setVehicleType(v.type);
                            if (priced) setQuote(q);
                          }}
                        />
                      );
                    })}
                  </VehicleList>
                </>
              )
            )}

            {/* ---------------- how it settles ---------------- */}
            {quote && (
              /* TODO(payments): the design's row reads "UPI · srini@okaxis"
                 with a "Change" link. There is no saved payment method and no
                 online payment on this deployment, so the row states the
                 method the trip actually settles with -- which the trip
                 record confirms -- and offers no link to a screen that does
                 not exist. */
              <div className="sg-row">
                <span className="sg-row__left">
                  <CardIcon />
                  Cash to the driver
                </span>
              </div>
            )}

            {/* ---------------- who is booking ---------------- */}
            {identify && stage !== 'requesting' && (
              <div className="border-t border-line pt-sg-4">
                <h2 className="text-lg font-semibold mt-0 mb-sg-3">
                  Book as a guest
                </h2>
                <GuestCheckout
                  fareLabel={fare}
                  onSignedIn={() => {
                    setIdentify(false);
                    setSignedIn(true);
                    requestRide();
                  }}
                  onSignIn={() =>
                    router.push(`/sign-in?next=${encodeURIComponent(bookingUrl())}`)
                  }
                  onCancel={() => setIdentify(false)}
                />
              </div>
            )}

            {/* ---------------- confirm ---------------- */}
            {quote && !identify && stage !== 'requesting' && (
              <div className="sg-ws__primary">
                {/* The label says what the button DOES, for everyone.
                    It used to read "Sign in to confirm Sedan" for a
                    signed-out visitor, which named a step rather than the
                    outcome and made an account look compulsory before the
                    alternative had been offered. */}
                <Button
                  variant="primary"
                  size="lg"
                  block
                  onClick={requestRide}
                  disabled={busy}
                >
                  {`Confirm ${vehicleClassLabel(vehicleType)}`}
                  {fare ? ` · ${fare}` : ''}
                  <ArrowRight />
                </Button>
                <FareLock>Fare locked. No surge after you book.</FareLock>
                {signedIn === false && (
                  <p className="caption text-ink-subtle mt-sg-2">
                    You can book as a guest — no password needed.
                  </p>
                )}
              </div>
            )}

            {stage === 'requesting' && (
              <div className="sg-ws__primary">
                <div className="sg-progress" aria-hidden="true">
                  <i />
                </div>
                <p className="caption text-ink-muted mt-sg-3" role="status">
                  Finding you a driver. Dispatch connection: {socketState}.
                </p>
              </div>
            )}
          </GlassPanel>
        )}

        {/* ---------------- the live trip ---------------- */}
        {stage === 'matched' && (
          <GlassPanel>
            <div className="flex items-start justify-between gap-sg-4">
              <div className="min-w-0">
                <h2 className="display-lg text-[34px] leading-[40px] m-0">
                  {tripHeadline()}
                </h2>
                <p className="sg-sheet__sub">
                  {pickupLabel ? `Meet at ${pickupLabel}` : `Trip #${tripId}`}
                </p>
              </div>
              <Badge tone={tripTone}>
                {TRIP_STATE_LABEL[tripState] ?? tripState ?? 'Requested'}
              </Badge>
            </div>

            {driverName ? (
              <DriverCard
                name={driverName}
                initials={initialsFor(driverName)}
                plate={plate}
                /* TODO(driver details): the design's card carries a rating to
                   two decimals and a "Make Model · Colour" line. The accept
                   broadcast sends `name` and `vehicle_number` and nothing
                   else, so those lines are left out rather than filled in. A
                   rider matching a stranger's car against an invented make
                   and colour is worse off than one who can see the field is
                   blank. */
              />
            ) : (
              <p className="body text-ink-muted" role="status">
                Waiting for a driver to accept.
              </p>
            )}

            {/* The pickup PIN.
                The driver cannot start the trip without it, and this page
                never showed it -- the server broadcasts it on accept and the
                client dropped it, so a rider booking on the website had no
                way to begin their ride. It is only useful between the driver
                being assigned and the trip starting, so it is shown exactly
                then. */}
            {pickupOtp && PIN_IS_STILL_NEEDED.includes(tripState) ? (
              <div className="sg-row">
                <span>
                  <span className="sg-field__label block">Ride PIN</span>
                  <span className="sg-sheet__sub m-0">
                    Share only once you are in the car
                  </span>
                </span>
                <span className="sg-pin sg-num">
                  {pickupOtp.split('').map((digit, i) => (
                    // A four-digit PIN repeats digits; the position is the
                    // only stable key it has.
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={i}>{digit}</span>
                  ))}
                </span>
              </div>
            ) : null}

            <ol className="sg-timeline">
              <li>
                <i className="sg-field__marker--pickup rounded-sg-pill" />
                <div>
                  <b>{pickupLabel || 'Pickup'}</b>
                  <span>Pickup</span>
                </div>
              </li>
              <li>
                <i className="sg-field__marker--drop rounded-[3px]" />
                <div>
                  <b>{destinationLabel || 'Destination'}</b>
                  <span>
                    Drop
                    {fare ? ` · ${fare} locked` : ''}
                    {' · Cash'}
                  </span>
                </div>
              </li>
            </ol>

            <p className="caption text-ink-subtle">Live updates: {socketState}</p>

            {/* TODO(share, safety): the design's trip sheet offers "Share
                trip" and "Safety". Neither exists on the web app -- there is
                no shareable-trip endpoint, and the SOS path is implemented in
                the mobile apps against the device's own contacts. A button
                that looks like a safety feature and does nothing is worse
                than its absence, so the panel carries only what works. */}

            {/* A ride that is over cannot be cancelled, and offering it
                invites a rider to try -- on trip #88 this sat under a
                paid-for fare. */}
            <div
              className={`border-t border-line pt-sg-4 grid gap-sg-3 ${
                TRIP_IS_OVER.includes(tripState) ? 'hidden' : ''
              }`}
            >
              <label htmlFor="cancel-reason" className="form-label">
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
              <Button variant="ghost" block onClick={doCancel} disabled={busy}>
                {busy ? 'Cancelling…' : 'Cancel ride'}
              </Button>
            </div>
          </GlassPanel>
        )}

        {/* ---------------- the trip is over ---------------- */}
        {stage === 'done' && (
          <GlassPanel>
            <div className="grid justify-items-center gap-sg-3 text-center">
              {tripState !== 'cancelled' && (
                <span className="grid place-items-center h-14 w-14 rounded-sg-pill bg-gold-500 text-on-gold">
                  <Check className="h-7 w-7" />
                </span>
              )}
              <h2 className="display-lg text-[38px] leading-[42px] m-0">
                {tripState === 'cancelled' ? 'Ride cancelled' : 'You have arrived'}
              </h2>
              {destinationLabel && <p className="sg-sheet__sub m-0">{destinationLabel}</p>}
            </div>

            {tripState !== 'cancelled' && (
              <>
                <FareSummary
                  label="Paid in cash"
                  amount={quote?.estimated_fare}
                  currency={quote?.currency ?? service?.zone?.currency}
                  badge={<Badge tone="neutral">Cash</Badge>}
                  lock={false}
                />
                <p className="caption text-ink-muted text-center">
                  Pay the driver in cash. Your receipt is emailed once they
                  confirm they have collected it.
                </p>
              </>
            )}

            {/* TODO(rating, tip): the design's completion sheet asks for a
                star rating and offers three tip chips. The rider-side rating
                endpoint and tipping are not built, so neither is shown: a
                star control that discards the tap is worse than no control. */}

            <ButtonLink href="/my-trips" variant="secondary" block>
              See your trips
            </ButtonLink>
          </GlassPanel>
        )}

        <p className="caption text-ink-subtle">
          Need help?{' '}
          <Link href="/contact" className="sg-link">
            Contact support
          </Link>
        </p>
      </section>
    </div>
  );
}

export default function BookPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense
      fallback={
        <div className="sg-page">
          <p className="body text-ink-muted" role="status">
            Loading…
          </p>
        </div>
      }
    >
      <BookPageInner />
    </Suspense>
  );
}
