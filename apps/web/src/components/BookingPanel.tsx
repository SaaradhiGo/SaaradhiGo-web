'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LatLng, Serviceability, serviceabilityAt } from '@/lib/booking';
import { messageFor } from '@/lib/publicAuth';
import { Button } from '@/components/sg/Button';
import { GlassPanel } from '@/components/sg/GlassPanel';
import {
  LocateAction,
  LocationField,
  RouteFields,
} from '@/components/sg/LocationField';
import { ArrowRight } from '@/components/sg/icons';

/**
 * The booking panel: the first thing on the site, and the thing the site is
 * for.
 *
 * SURFACE
 * A `bg-glass` panel floating over the hero map, with the design system's
 * 56px gold bar on its top edge and a `gold-line` hairline around it. It was
 * previously a warm paper card in a `sand` palette that the design system
 * does not contain; the glass panel is what the handoff specifies for a
 * control that sits on top of a map.
 *
 * WHAT IT CLAIMS
 * Only what the server returned. "We do not operate here yet" comes from
 * `serviceable: false`; the city, currency and vehicle count come from the
 * zone. No coverage claim, no driver count, no ETA and no indicative price,
 * because this screen cannot know any of them. The logic below is unchanged
 * from before the redesign -- same serviceability check, same geolocation
 * fallbacks, same query string handed to `/book`.
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
    <GlassPanel
      title="Book a ride"
      action={
        busy ? (
          <span className="caption text-ink-muted" role="status">
            Checking…
          </span>
        ) : undefined
      }
      note="You will be asked to sign in before the ride is requested."
    >
      {/* The two inputs, joined by the dashed route rail so pickup and
          destination read as one journey rather than two unrelated boxes.
          The markers differ in shape -- circle, square -- not only colour. */}
      <RouteFields>
        <LocationField
          id="bp-pickup"
          kind="pickup"
          label="Pickup"
          placeholder="Where are you?"
          value={pickupText}
          autoComplete="off"
          onChange={(e) => setPickupText(e.target.value)}
          onBlur={(e) => onPickupBlur(e.target.value)}
          action={<LocateAction onClick={useMyLocation} busy={locating} />}
        />
        <LocationField
          id="bp-dest"
          kind="drop"
          label="Destination"
          placeholder="Where to?"
          value={destText}
          autoComplete="off"
          onChange={(e) => setDestText(e.target.value)}
        />
      </RouteFields>

      {/* Four states, all from the server, none invented. Each one says a
          word; none of them is carried by a colour alone. */}
      {service && !service.serviceable && (
        <p className="alert alert-info" role="status">
          We do not operate at that pickup point yet.
        </p>
      )}

      {zone && service?.serviceable && (
        <p className="sg-row caption text-ink-muted" role="status">
          <span className="sg-row__left">
            <span
              className="sg-field__marker sg-field__marker--pickup"
              aria-hidden="true"
            />
            <strong className="text-ink font-bold">{zone.name}</strong>
          </span>
          <span className="sg-num">
            fares in {zone.currency} · {service.vehicle_types.length}{' '}
            {service.vehicle_types.length === 1 ? 'vehicle type' : 'vehicle types'}
          </span>
        </p>
      )}

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {/* The one primary action on this view. */}
      <Button variant="primary" size="lg" block onClick={go} disabled={busy}>
        See fares
        <ArrowRight />
      </Button>
    </GlassPanel>
  );
}
