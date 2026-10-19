'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LatLng, Serviceability, serviceabilityAt } from '@/lib/booking';
import { messageFor } from '@/lib/publicAuth';

/**
 * The booking panel: the first thing on the site, and the thing the site is
 * for.
 *
 * SURFACE
 * It is a warm paper panel on charcoal, not another dark card. As one more
 * dark box on a dark page, the single most important control on the site had
 * no more presence than a paragraph of text, and the page read as something
 * to scroll rather than something to use.
 *
 * WHAT IT CLAIMS
 * Only what the server returned. "We do not operate here yet" comes from
 * `serviceable: false`; the city, currency and distance unit come from the
 * zone. No coverage claim, no driver count, no ETA and no indicative price,
 * because this screen cannot know any of them.
 */
export default function BookingPanel() {
  const router = useRouter();

  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [pickupText, setPickupText] = useState('');
  const [destText, setDestText] = useState('');
  const [service, setService] = useState<Serviceability | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check(point: LatLng) {
    setBusy(true);
    setError(null);
    try {
      setService(await serviceabilityAt(point));
    } catch (err) {
      setError(messageFor(err, 'We could not check that pickup point.'));
    } finally {
      setBusy(false);
    }
  }

  function useMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError('This browser cannot share your location. Type a pickup point instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPickup(p);
        setPickupText(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
        setLocating(false);
        void check(p);
      },
      () => {
        setLocating(false);
        setError(
          'We could not read your location. Allow location access, or type a pickup point.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function parsePoint(value: string): LatLng | null {
    const [a, b] = value.split(',').map((s) => s.trim());
    const lat = Number(a);
    const lng = Number(b);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function onPickupBlur(value: string) {
    if (!value.trim()) return;
    const p = parsePoint(value);
    if (!p) {
      setError('Enter the pickup as "latitude, longitude", or use your location.');
      return;
    }
    setPickup(p);
    void check(p);
  }

  function go() {
    if (!pickup) {
      setError('Set a pickup point first.');
      return;
    }
    const params = new URLSearchParams({ pickup: `${pickup.lat},${pickup.lng}` });
    const d = parsePoint(destText);
    if (d) params.set('dest', `${d.lat},${d.lng}`);
    else if (destText.trim()) params.set('q', destText.trim());
    router.push(`/book?${params.toString()}`);
  }

  const zone = service?.zone;

  return (
    <div className="booking-panel">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold text-sand-700">Book a ride</h2>
        {busy && (
          <span className="text-xs text-sand-600" role="status">
            Checking…
          </span>
        )}
      </div>

      {/* The two inputs, joined by a route rail so pickup and destination
          read as one journey rather than two unrelated boxes. */}
      <div className="mt-5 flex gap-3">
        <div aria-hidden="true" className="route-rail" />

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <label htmlFor="bp-pickup" className="field-label">
              Pickup
            </label>
            <input
              id="bp-pickup"
              className="field-input"
              placeholder="Where are you?"
              value={pickupText}
              onChange={(e) => setPickupText(e.target.value)}
              onBlur={(e) => onPickupBlur(e.target.value)}
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-sand-700 hover:text-black disabled:opacity-50"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3.5" />
                <circle cx="12" cy="12" r="8" opacity="0.5" />
                <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
              </svg>
              {locating ? 'Finding you…' : 'Use my current location'}
            </button>
          </div>

          <div>
            <label htmlFor="bp-dest" className="field-label">
              Destination
            </label>
            <input
              id="bp-dest"
              className="field-input"
              placeholder="Where to?"
              value={destText}
              onChange={(e) => setDestText(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Four states, all from the server, none invented. */}
      {service && !service.serviceable && (
        <p className="mt-4 rounded-xl bg-amber-500/10 border border-amber-600/30 px-3.5 py-2.5 text-sm text-amber-900">
          We do not operate at that pickup point yet.
        </p>
      )}

      {zone && service?.serviceable && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-sand-600">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
          <strong className="font-semibold text-sand-700">{zone.name}</strong>
          <span>· fares in {zone.currency}</span>
          <span>
            · {service.vehicle_types.length}{' '}
            {service.vehicle_types.length === 1 ? 'vehicle type' : 'vehicle types'}
          </span>
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 border border-red-600/30 px-3.5 py-2.5 text-sm text-red-900">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={go}
        className="btn-gold mt-5 w-full"
        disabled={busy}
      >
        See fares
      </button>
      <p className="mt-3 text-center text-xs text-sand-600">
        You will be asked to sign in before the ride is requested.
      </p>
    </div>
  );
}
