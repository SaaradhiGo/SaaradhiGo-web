'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/form';
import { LatLng, Serviceability, serviceabilityAt } from '@/lib/booking';
import { messageFor } from '@/lib/publicAuth';

/**
 * The booking panel on the first screen.
 *
 * It exists so the answer to "how do I book a ride?" is visible without
 * scrolling. It collects the two things a booking needs -- where you are and
 * where you are going -- checks the pickup against the server's service
 * zones, and hands both to /book, which runs the rest of the journey.
 *
 * It states only what the server told it. "We do not operate here yet" comes
 * from `serviceable: false`; the city name and currency come from the zone.
 * There is no coverage claim, no driver count and no indicative price on this
 * panel, because none of those are things this page can know.
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
    const params = new URLSearchParams({
      pickup: `${pickup.lat},${pickup.lng}`,
    });
    const d = parsePoint(destText);
    if (d) params.set('dest', `${d.lat},${d.lng}`);
    else if (destText.trim()) params.set('q', destText.trim());
    router.push(`/book?${params.toString()}`);
  }

  const zone = service?.zone;

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-700/90 p-5 sm:p-6 shadow-panel backdrop-blur">
      <h2 className="text-lg font-semibold">Book a ride</h2>
      <p className="mt-1 text-sm text-white/55">
        See the fare before you confirm.
      </p>

      <div className="mt-5 space-y-3">
        <div>
          <label htmlFor="bp-pickup" className="label">
            Pickup
          </label>
          {/* `min-w-0` matters: `.input` is `w-full`, and a w-full flex item
              keeps its intrinsic min-width unless told otherwise, so the row
              grew past the viewport on a phone. */}
          <div className="flex gap-2 min-w-0">
            <input
              id="bp-pickup"
              className="input min-w-0 flex-1"
              placeholder="Your location"
              value={pickupText}
              onChange={(e) => setPickupText(e.target.value)}
              onBlur={(e) => onPickupBlur(e.target.value)}
            />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="btn-secondary shrink-0 px-3"
              aria-label="Use my current location"
              title="Use my current location"
            >
              {locating ? '…' : '◎'}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="bp-dest" className="label">
            Destination
          </label>
          <input
            id="bp-dest"
            className="input"
            placeholder="Where to?"
            value={destText}
            onChange={(e) => setDestText(e.target.value)}
          />
        </div>

        {busy && (
          <p className="text-xs text-white/50" role="status">
            Checking this pickup point…
          </p>
        )}

        {service && !service.serviceable && (
          <Alert kind="info">
            We do not operate at that pickup point yet.
          </Alert>
        )}

        {zone && service?.serviceable && (
          <p className="text-xs text-white/55">
            {zone.name} · fares in {zone.currency} ·{' '}
            {service.vehicle_types.length}{' '}
            {service.vehicle_types.length === 1 ? 'vehicle type' : 'vehicle types'}
          </p>
        )}

        {error && <Alert kind="error">{error}</Alert>}

        <button
          type="button"
          onClick={go}
          className="btn-primary w-full"
          disabled={busy}
        >
          See fares
        </button>
        <p className="text-xs text-white/40 text-center">
          You will be asked to sign in before the ride is requested.
        </p>
      </div>
    </div>
  );
}
