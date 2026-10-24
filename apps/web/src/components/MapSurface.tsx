'use client';

import { useEffect, useRef, useState } from 'react';

import { decodePolyline, loadGoogleMaps, mapsConfigured } from '@/lib/googleMaps';
import { DESTINATION_SQUARE, mapStyles, readMapPalette } from '@/lib/mapStyle';

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
 * So: a plain surface, a plain statement of what is missing, and -- when the
 * server has resolved a pickup -- the real city, currency and vehicle count
 * beneath it. Those come from `/pricing/vehicle-types/`, not from here. The
 * fallback contract is unchanged by the redesign: `showingMap` still requires
 * both a loaded library AND a real coordinate, and the host stays
 * `invisible` until both hold.
 *
 * WHAT THE REDESIGN ADDED
 * The basemap is now the design system's own: `lib/mapStyle.ts` builds a
 * Google style array out of the seven `--map-*` tokens, and the journey is
 * drawn the way the handoff draws it --
 *
 *   * the route as a 4.5px `gold-500` line over an 18px `gold-soft` glow,
 *   * pickup as a `pickup` CIRCLE inside a soft halo,
 *   * destination as a rounded `gold-500` SQUARE with a `noir` centre,
 *
 * so the two ends of the journey differ in shape as well as in colour, here
 * and in the location fields. Everything is re-read and redrawn when the
 * rider switches theme, which is why the palette is resolved from the
 * document instead of being baked in.
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
  cityCentre = null,
  children,
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
  /**
   * A city to centre on, for a map that illustrates a service area rather
   * than a journey. It draws NO marker: a pin here would read as the rider's
   * own pickup, which is the one thing this surface must never imply.
   */
  cityCentre?: MapPoint | null;
  /** Floating `MapLabel` pills and scrims, drawn over the surface. */
  children?: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<unknown>(null);
  const drawn = useRef<unknown[]>([]);
  const [live, setLive] = useState(false);
  // Bumped whenever the theme changes, to re-resolve the tokens and redraw.
  const [themeTick, setThemeTick] = useState(0);

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

  // The map's colours come from CSS custom properties, which a theme switch
  // changes without React knowing. Watching the attribute is what keeps an
  // ivory basemap from staying ivory after the rider goes back to dark.
  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Draw. Re-runs whenever the journey or the theme changes.
  useEffect(() => {
    if (!live || !host.current) return;
    const g = (window as unknown as { google?: any }).google;
    if (!g?.maps) return;

    const palette = readMapPalette();
    const styles = mapStyles(palette);

    const centre = pickup ?? destination ?? cityCentre ?? null;
    if (!map.current) {
      map.current = new g.maps.Map(host.current, {
        // Centre on a REAL point only. With nothing resolved yet there is
        // nothing truthful to centre on, so the placeholder is still showing.
        center: centre ?? { lat: 0, lng: 0 },
        // A city centre is a wider view than a pickup: it is showing a
        // place, not a doorstep.
        zoom: pickup || destination ? 14 : cityCentre ? 12 : 2,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        clickableIcons: false,
        styles,
      });
    } else {
      // A theme switch restyles the existing map rather than rebuilding it,
      // so the rider keeps their pan and zoom.
      (map.current as any).setOptions({ styles });
    }
    const m = map.current as any;

    for (const o of drawn.current as any[]) o.setMap?.(null);
    drawn.current = [];

    const bounds = new g.maps.LatLngBounds();
    let anything = false;

    const add = (overlay: any, at?: MapPoint) => {
      drawn.current.push(overlay);
      if (at) {
        bounds.extend(at);
        anything = true;
      }
    };

    /**
     * Pickup: a circle, inside a halo.
     *
     * Two markers rather than one, because the halo is the same shape at a
     * lower opacity and a single symbol cannot be both. The halo is drawn
     * first and sits beneath, so the solid core stays crisp.
     */
    const pickupPin = (at: MapPoint) => {
      add(
        new g.maps.Marker({
          position: at,
          map: m,
          clickable: false,
          zIndex: 3,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: palette.pickup,
            fillOpacity: 0.16,
            strokeWeight: 0,
          },
        }),
      );
      add(
        new g.maps.Marker({
          position: at,
          map: m,
          title: 'Pickup',
          zIndex: 5,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: palette.pickup,
            fillOpacity: 1,
            strokeColor: palette.surface,
            strokeWeight: 4,
          },
        }),
        at,
      );
    };

    /**
     * Destination: a rounded gold square with a `noir` centre.
     *
     * The centre dot is what makes it read as a destination marker rather
     * than a gold tile, and it is `noir` in both themes because it sits
     * inside a gold fill, which does not change between them.
     */
    const destinationPin = (at: MapPoint) => {
      add(
        new g.maps.Marker({
          position: at,
          map: m,
          title: 'Destination',
          zIndex: 5,
          icon: {
            path: DESTINATION_SQUARE,
            scale: 0.8,
            fillColor: palette.gold,
            fillOpacity: 1,
            strokeColor: palette.surface,
            strokeWeight: 4,
            anchor: new g.maps.Point(0, 0),
          },
        }),
        at,
      );
      add(
        new g.maps.Marker({
          position: at,
          map: m,
          clickable: false,
          zIndex: 6,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 2.5,
            fillColor: palette.noir,
            fillOpacity: 1,
            strokeWeight: 0,
          },
        }),
      );
    };

    /** The driver's car: champagne, so it is neither end of the journey. */
    const driverPin = (at: MapPoint) => {
      add(
        new g.maps.Marker({
          position: at,
          map: m,
          title: 'Your driver',
          zIndex: 7,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: palette.gold,
            fillOpacity: 1,
            strokeColor: palette.noir,
            strokeWeight: 2,
          },
        }),
        at,
      );
    };

    if (pickup) pickupPin(pickup);
    if (destination) destinationPin(destination);
    if (driver) driverPin(driver);

    if (routePolyline) {
      const path = decodePolyline(routePolyline);
      if (path.length > 1) {
        // The glow first, then the line on top of it. `gold-soft` IS
        // `gold-500` at 14% -- the token is the rgba form of exactly that --
        // and the Maps API takes a colour plus an opacity rather than an rgba
        // string, so it is expressed as the pair here.
        add(
          new g.maps.Polyline({
            path,
            map: m,
            clickable: false,
            zIndex: 1,
            strokeColor: palette.gold,
            strokeOpacity: 0.14,
            strokeWeight: 18,
          }),
        );
        add(
          new g.maps.Polyline({
            path,
            map: m,
            clickable: false,
            zIndex: 2,
            strokeColor: palette.gold,
            strokeOpacity: 1,
            strokeWeight: 4.5,
          }),
        );
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
  }, [live, pickup, destination, routePolyline, driver, cityCentre, themeTick]);

  // A map is drawn only when the library loaded AND there is a real point to
  // show. Anything else keeps the honest placeholder.
  const showingMap = live
    && Boolean(pickup || destination || routePolyline || cityCentre);

  return (
    <div className={`map-surface sg-map ${className}`}>
      {/* The map host.
          `aria-label` on a bare <div> is an ARIA error -- a generic element
          has no role for the name to attach to -- and until there is a map in
          here it is an empty box, so labelling it announces a region with
          nothing in it. Both are fixed by naming it only once it holds
          something: `role="region"` while a journey is drawn, and nothing at
          all while the fallback is showing. */}
      <div
        ref={host}
        {...(showingMap ? { role: 'region', 'aria-label': 'Map' } : { 'aria-hidden': true })}
        className={`absolute inset-0 ${showingMap ? '' : 'invisible'}`}
      />

      {/* Scrims and floating labels, over the surface. */}
      {showingMap && children}

      <div className="absolute inset-0 grid place-items-center p-sg-6 text-center pointer-events-none">
        {ready || showingMap ? null : (
          <div className="max-w-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mx-auto h-9 w-9 text-ink-subtle"
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
            <p className="mt-sg-4 title">Map view unavailable</p>
            <p className="mt-sg-2 body text-ink-muted">
              The map is temporarily unavailable. Booking, fares and trip
              tracking are working normally.
            </p>
          </div>
        )}
      </div>

      {zoneName && (
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-gold-line bg-bg-glass px-sg-5 py-sg-3 backdrop-blur">
          <p className="caption flex flex-wrap items-center gap-x-sg-3 gap-y-sg-1">
            <span className="sg-field__marker sg-field__marker--pickup" aria-hidden="true" />
            <strong className="title">{zoneName}</strong>
            {currency && <span className="text-ink-muted">fares in {currency}</span>}
            {typeof vehicleCount === 'number' && (
              <span className="text-ink-muted sg-num">
                {vehicleCount} {vehicleCount === 1 ? 'vehicle type' : 'vehicle types'}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
