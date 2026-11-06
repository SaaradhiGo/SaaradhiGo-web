'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, mapsConfigured } from '@/lib/googleMaps';
import { mapStyles, readMapPalette } from '@/lib/mapStyle';
import { fetchServiceAreas, primaryArea } from '@/lib/serviceAreas';

/**
 * The hero's map: a real Google map of the city, in the theme's style
 * (owner, 2026-11-06). No drawn map, ever.
 *
 * - Tablet and desktop only (600px and up); a phone gets no hero map.
 * - Loaded after first paint, so it never holds up the headline or the panel.
 * - No browser key, a refused key, or no city centre: nothing is drawn at all.
 * - No markers: this shows the city, not anyone's pickup.
 */
export function HeroMap() {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const [state, setState] = useState<'off' | 'loading' | 'live'>('off');

  useEffect(() => {
    if (!mapsConfigured() || !window.matchMedia('(min-width: 600px)').matches) return;
    let cancelled = false;
    const w = window as typeof window & { gm_authFailure?: () => void };
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => { setState('off'); previous?.(); };

    const start = () => {
      if (cancelled) return;
      setState('loading');
      Promise.all([loadGoogleMaps(), fetchServiceAreas().then(primaryArea).catch(() => null)])
        .then(([ok, area]) => {
          const g = (window as unknown as { google?: any }).google;
          if (cancelled || !ok || !area?.centre || !host.current || !g?.maps?.Map) {
            if (!cancelled) setState('off');
            return;
          }
          map.current = new g.maps.Map(host.current, {
            center: area.centre,
            zoom: 12,
            disableDefaultUI: true,
            gestureHandling: 'cooperative',
            clickableIcons: false,
            keyboardShortcuts: false,
            styles: mapStyles(readMapPalette(), { publicSite: true }),
          });
          // Shown only once Google has drawn tiles.
          g.maps.event.addListenerOnce(map.current, 'tilesloaded', () => {
            if (!cancelled) setState('live');
          });
        });
    };
    // After first paint, and when the browser is idle.
    const idle = (window as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
    const handle = idle ? idle(start) : window.setTimeout(start, 1);

    // A theme switch restyles the map in place.
    const observer = new MutationObserver(() => {
      map.current?.setOptions({ styles: mapStyles(readMapPalette(), { publicSite: true }) });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (!idle) window.clearTimeout(handle);
      w.gm_authFailure = previous;
    };
  }, []);

  if (state === 'off') return null;
  return (
    <div className="hp-map" aria-hidden="true" data-live={state === 'live' ? 'true' : undefined}>
      <div ref={host} className="hp-map__canvas" />
    </div>
  );
}
