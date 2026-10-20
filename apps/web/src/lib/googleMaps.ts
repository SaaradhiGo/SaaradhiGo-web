/**
 * Loading the Google Maps JS API, once per page.
 *
 * Deliberately NOT an npm dependency. Google serves this library from its own
 * CDN keyed to the browser key, the loader is about thirty lines, and a
 * wrapper package would add a version to keep current for no behaviour we
 * need. If we later want React bindings, that is the moment to reconsider.
 *
 * THE KEY HERE IS NOT THE SERVER KEY. The backend's `GOOGLE_MAPS_API_KEY`
 * calls Routes, Geocoding and Places from Railway and must never reach a
 * browser. This is a second, separate key, restricted by HTTP referrer, and
 * it is public by nature: anything shipped to a browser can be read from it.
 * That is why it is scoped to Maps JavaScript only.
 */

const SRC_ID = 'saaradhigo-google-maps-js';

let loader: Promise<boolean> | null = null;

/** The browser key, or '' when the owner has not configured one yet. */
export function browserMapsKey(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '').trim();
}

export function mapsConfigured(): boolean {
  return browserMapsKey().length > 0;
}

/**
 * Resolves true once `google.maps` is usable, false if it cannot be loaded.
 *
 * Never throws: a map that will not load is a degraded panel, not a broken
 * booking page, and the caller falls back to the placeholder.
 */
export function loadGoogleMaps(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!mapsConfigured()) return Promise.resolve(false);

  const w = window as unknown as { google?: { maps?: unknown } };
  if (w.google?.maps) return Promise.resolve(true);
  if (loader) return loader;

  loader = new Promise<boolean>((resolve) => {
    const existing = document.getElementById(SRC_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id = SRC_ID;
    // `loading=async` is what Google asks for; `v=weekly` pins a channel
    // rather than an exact build so security fixes arrive without us.
    script.src =
      'https://maps.googleapis.com/maps/api/js'
      + `?key=${encodeURIComponent(browserMapsKey())}`
      + '&v=weekly&loading=async';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      // Referrer restriction, billing, blocked network. The reason belongs in
      // operations; the rider just sees the placeholder.
      console.warn('[maps] Google Maps JS failed to load');
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return loader;
}

/**
 * Google's own polyline codec, so a route drawn here matches the one the
 * backend returned byte for byte.
 *
 * `routes[0].overview_polyline.points` comes back in this encoding from the
 * Routes API exactly as it did from Directions, which is why the backend
 * could translate between them without the clients noticing.
 */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
