'use client';

import { useEffect, useRef, useState } from 'react';

import { decodePolyline, loadGoogleMaps, mapsConfigured } from '@/lib/googleMaps';

export type MapPoint = { lat: number; lng: number };

/**
 * Where the map goes.
 *
 * THIS COMPONENT WILL NOT DRAW A FAKE MAP.
 *
 * A real interactive map needs a configured tile provider. When there is
 * none, the honest thing is to say the map is unavailable -- not to render
 * decorative streets, a blurred screenshot, or a grid that a customer could
 * reasonably read as "this is where I am". A ride-hailing product that draws
 * an imaginary map has told the customer exactly how much to trust the
 * driver's position later.
 *
 * So: a faint neutral grid that is obviously a placeholder surface, a plain
 * statement of what is missing, and -- when the server has resolved a pickup
 * -- the real city, currency and vehicle count beneath it. Those come from
 * `/pricing/vehicle-types/`, not from here.
 *
 * When a provider IS configured, this is the component to render the map
 * into; the contract (`ready`) is already here so the page does not need to
 * change shape when that day comes.
 */
export default function MapSurface({
  ready = false,
  zoneName,
  currency,
  vehicleCount,
  className = '',
  pickup = null,
  destination = null,
  routePolyline = null,
  driver = null,
}: {
  /** Force the placeholder off even when no provider is configured. */
  ready?: boolean;
  zoneName?: string | null;
  currency?: string | null;
  vehicleCount?: number | null;
  className?: string;
  /** Real coordinates only. Never a guess, never a default city. */
  pickup?: MapPoint | null;
  destination?: MapPoint | null;
  /** Encoded polyline exactly as the backend returned it. */
  routePolyline?: string | null;
  /** The assigned driver's live position, once there is one. */
  driver?: MapPoint | null;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<unknown>(null);
  const drawn = useRef<unknown[]>([]);
  const [live, setLive] = useState(false);

  // Load the library once, and only if the owner has configured a browser
  // key. Without one this resolves false and the placeholder stays.
  useEffect(() => {
    let cancelled = false;
    if (!mapsConfigured()) return;
    loadGoogleMaps().then((ok) => {
      if (!cancelled) setLive(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Draw. Re-runs whenever the journey changes.
  useEffect(() => {
    if (!live || !host.current) return;
    const g = (window as unknown as { google?: any }).google;
    if (!g?.maps) return;

    const centre = pickup ?? destination ?? null;
    if (!map.current) {
      map.current = new g.maps.Map(host.current, {
        // Centre on a REAL point only. With nothing resolved yet there is
        // nothing truthful to centre on, so the placeholder is still showing.
        center: centre ?? { lat: 0, lng: 0 },
        zoom: centre ? 14 : 2,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
      });
    }
    const m = map.current as any;

    for (const o of drawn.current as any[]) o.setMap?.(null);
    drawn.current = [];

    const bounds = new g.maps.LatLngBounds();
    let anything = false;

    const pin = (at: MapPoint, color: string, title: string) => {
      const marker = new g.maps.Marker({
        position: at,
        map: m,
        title,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#1a1a1a',
          strokeWeight: 2,
        },
      });
      drawn.current.push(marker);
      bounds.extend(at);
      anything = true;
    };

    if (pickup) pin(pickup, '#e8b93b', 'Pickup');
    if (destination) pin(destination, '#8ab4f8', 'Destination');
    if (driver) pin(driver, '#34d399', 'Your driver');

    if (routePolyline) {
      const path = decodePolyline(routePolyline);
      if (path.length > 1) {
        const line = new g.maps.Polyline({
          path,
          map: m,
          strokeColor: '#e8b93b',
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });
        drawn.current.push(line);
        for (const point of path) bounds.extend(point);
        anything = true;
      }
    }

    if (anything && !bounds.isEmpty()) {
      if (pickup && !destination && !driver && !routePolyline) {
        m.setCenter(pickup);
        m.setZoom(15);
      } else {
        m.fitBounds(bounds, 48);
      }
    }
  }, [live, pickup, destination, routePolyline, driver]);

  // A map is drawn only when the library loaded AND there is a real point to
  // show. Anything else keeps the honest placeholder.
  const showingMap = live && Boolean(pickup || destination || routePolyline);

  return (
    <div className={`map-surface ${className}`}>
      <div
        ref={host}
        aria-label="Map"
        className={`absolute inset-0 ${showingMap ? '' : 'invisible'}`}
      />
      <div className="absolute inset-0 grid place-items-center p-8 text-center">
        {ready || showingMap ? null : (
          <div className="max-w-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mx-auto h-9 w-9 text-white/25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5Z" />
              <path d="M9 4.5v12.7M15 6.8v12.7" />
            </svg>
            {/* Customer-facing copy: what it means for THEM, not what is
                missing on our side. "No map provider is configured for this
                deployment" told a passenger about our configuration and left
                them unsure whether their booking would work. Why the map is
                absent belongs in the operational logs. */}
            <p className="mt-4 text-sm font-medium text-white/70">
              Map view unavailable
            </p>
            <p className="mt-1.5 text-sm text-white/45">
              The map is temporarily unavailable. Booking, fares and trip
              tracking are working normally.
            </p>
          </div>
        )}
      </div>

      {zoneName && (
        <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.07] bg-ink-900/85 px-5 py-3.5 backdrop-blur">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 rounded-full bg-emerald-400"
            />
            <strong className="font-semibold">{zoneName}</strong>
            {currency && <span className="text-white/55">fares in {currency}</span>}
            {typeof vehicleCount === 'number' && (
              <span className="text-white/55">
                {vehicleCount} {vehicleCount === 1 ? 'vehicle type' : 'vehicle types'}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
