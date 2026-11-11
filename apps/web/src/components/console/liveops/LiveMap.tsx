'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadGoogleMaps, mapsConfigured } from '@/lib/googleMaps';
import { mapStyles, readMapPalette } from '@/lib/mapStyle';
import {
  STATUS_WORDS, TRIP_STATE_WORDS, cellBounds, cellSentence, shadeLevel,
  type Dot, type HeatCell, type LiveAlert, type LiveTrip, type ZoneOutline,
} from '@/lib/liveOps';
import { boundsOf, makeProjector, ringPath, type Bounds, type Position } from '@/lib/zones';

/**
 * The live map: Google Maps when the build has a browser key, a scaled SVG when it does not.
 *
 * ONE MAP VENDOR. This is the Google Maps JS the console already loads
 * (`lib/googleMaps.ts`, the referrer-restricted browser key). No other tile provider,
 * no npm package. Markers and rectangles only; nothing from the Drawing library.
 *
 * WITHOUT A KEY THE PAGE STILL WORKS, as the zones page does: zone outlines to scale,
 * north up, with the dots, trip lines, alert pins and heat cells drawn on them. It says
 * so in a line under the map rather than pretending to be a street map.
 *
 * THE MAP IS NEVER THE ONLY WAY TO READ THE DATA. Dots are not tab stops (there can be
 * two thousand); the list view beside this map carries every one of them, keyboard
 * reachable, and the figure's label says so.
 */

/** What a click on the map picks. */
export type MapPick = { kind: 'alert' | 'driver' | 'trip'; id: number };
export type Follow = { lat: number; lng: number; n: number };

export type Layers = { drivers: boolean; trips: boolean; alerts: boolean; heatmap: boolean };

type Props = {
  zones: ZoneOutline[];
  dots: Dot[];
  trips: LiveTrip[];
  alerts: LiveAlert[];
  cells: HeatCell[];
  layers: Layers;
  /** The driver's own page for a dot, or null when this role may not open it (the link rule). */
  driverHref: (driverId: number) => string | null;
  windowMinutes: number;
  caption: string;
  /** Cities that decide the view (the ones with something live); null = every zone drawn. */
  focus?: string[] | null;
  /** Workspace mode: fill the parent, and report clicks instead of navigating. */
  fill?: boolean;
  onPick?: (pick: MapPick) => void;
  /** Pan to this point; a new `n` re-pans. */
  follow?: Follow | null;
};

const W = 960;
const H = 520;

/** The server sends [lat, lng]; the zone helpers want [lng, lat]. */
const toPositions = (rings: [number, number][][]): Position[][] =>
  rings.map((ring) => ring.map(([lat, lng]) => [lng, lat] as Position));

export function LiveMap(props: Props) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!mapsConfigured()) return;
    let cancelled = false;
    void loadGoogleMaps().then((ok) => { if (!cancelled) setLive(ok); });
    const w = window as typeof window & { gm_authFailure?: () => void };
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => { setLive(false); previous?.(); };
    return () => { cancelled = true; w.gm_authFailure = previous; };
  }, []);
  return live ? <GoogleLiveMap {...props} /> : <OutlineLiveMap {...props} />;
}

// ---------------------------------------------------------------------------
// The scaled outline
// ---------------------------------------------------------------------------

function pointBounds(points: Position[]): Bounds | null {
  return points.length ? boundsOf([points]) : null;
}

function OutlineLiveMap({ zones, dots, trips, alerts, cells, layers, driverHref, windowMinutes, caption, focus, fill, onPick }: Props) {
  const rings = useMemo(() => {
    const picked = focus && focus.length ? zones.filter((z) => z.city && focus.includes(z.city)) : [];
    return (picked.length ? picked : zones).flatMap((z) => toPositions(z.rings));
  }, [zones, focus]);
  const bounds = useMemo(() => {
    // What is on the map decides the view: a city's zone can be far larger than the
    // part of it with anything in it. With nothing drawn, the zones decide.
    const pts: Position[] = [
      ...(layers.drivers ? dots.map((d) => [d.lng, d.lat] as Position) : []),
      ...(layers.trips ? trips.flatMap((t) => [[t.pickup_lng, t.pickup_lat], [t.drop_lng, t.drop_lat]] as Position[]) : []),
      ...(layers.heatmap ? cells.flatMap((c) => {
        const [south, west, north, east] = cellBounds(c);
        return [[west, south], [east, north]] as Position[];
      }) : []),
    ];
    const b = pointBounds(pts);
    if (!b) return boundsOf(rings);
    const padLng = Math.max((b.maxLng - b.minLng) * 0.15, 0.02);
    const padLat = Math.max((b.maxLat - b.minLat) * 0.15, 0.02);
    return { minLng: b.minLng - padLng, maxLng: b.maxLng + padLng, minLat: b.minLat - padLat, maxLat: b.maxLat + padLat };
  }, [rings, dots, trips, cells, layers]);
  const projector = useMemo(() => (bounds ? makeProjector(bounds, W, H, 28) : null), [bounds]);

  if (!bounds || !projector) {
    return (
      <figure className={`lo-map ${fill ? 'lo-map--fill' : ''}`}>
        <p className="lo-map__empty">Nothing to draw yet. No zone is configured in this scope.</p>
      </figure>
    );
  }
  const P = projector;
  const at = (lat: number, lng: number) => P.project([lng, lat]);
  const inside = (p: { x: number; y: number }) => p.x >= -20 && p.x <= W + 20 && p.y >= -20 && p.y <= H + 20;

  return (
    <figure className={`lo-map ${fill ? 'lo-map--fill' : ''}`}>
      <svg className="lo-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={caption}>
        <defs>
          <pattern id="lo-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" className="lo-hatch__line" />
          </pattern>
        </defs>
        {zones.map((z) => toPositions(z.rings).map((ring, i) => (
          <path key={`${z.code}-${i}`} d={ringPath(ring, P)} className="lo-zone"><title>{`${z.name} (${z.code})`}</title></path>
        )))}

        {layers.heatmap ? cells.filter((c) => shadeLevel(c) > 0).map((c) => {
          const [south, west, north, east] = cellBounds(c);
          const a = at(north, west);
          const b = at(south, east);
          if (!inside(a) && !inside(b)) return null;
          return (
            <rect
              key={`${c.row}:${c.col}`} x={a.x} y={a.y} width={Math.max(1, b.x - a.x)} height={Math.max(1, b.y - a.y)}
              className="lo-cell lo-cell--short" fill="url(#lo-hatch)"
            >
              <title>{cellSentence(c, windowMinutes)}</title>
            </rect>
          );
        }) : null}

        {layers.trips ? trips.map((t) => {
          const from = at(t.pickup_lat, t.pickup_lng);
          const to = at(t.drop_lat, t.drop_lng);
          return (
            <g
              key={t.id} className={`lo-trip ${t.stale ? 'lo-trip--stale' : ''}`}
              onClick={onPick ? () => onPick({ kind: 'trip', id: t.id }) : undefined}
            >
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="lo-trip__hit" />
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="lo-trip__line" />
              <circle cx={from.x} cy={from.y} r={3} className="lo-trip__from" />
              <rect x={to.x - 3} y={to.y - 3} width={6} height={6} className="lo-trip__to" />
              <title>{`Trip ${t.id}, ${TRIP_STATE_WORDS[t.state] ?? t.state}${t.stale ? ', no recent signal' : ''}`}</title>
            </g>
          );
        }) : null}

        {layers.drivers ? dots.map((d) => {
          const p = at(d.lat, d.lng);
          if (!inside(p)) return null;
          const label = `Driver ${d.driver_id}, ${STATUS_WORDS[d.status].toLowerCase()}${d.vehicle_class ? `, ${d.vehicle_class}` : ''}`;
          const href = driverHref(d.driver_id);
          const circle = <circle cx={p.x} cy={p.y} r={5} className={`lo-dot lo-dot--${d.status}`}><title>{label}</title></circle>;
          if (onPick) return <g key={d.driver_id} onClick={() => onPick({ kind: 'driver', id: d.driver_id })}>{circle}</g>;
          return href ? (
            // Not a tab stop: there may be two thousand, and the list view carries every one.
            <a key={d.driver_id} href={href} tabIndex={-1} aria-label={label}>{circle}</a>
          ) : <g key={d.driver_id}>{circle}</g>;
        }) : null}

        {layers.alerts ? alerts.filter((a) => a.lat !== null && a.lng !== null).map((a) => {
          const p = at(a.lat as number, a.lng as number);
          return (
            <path
              key={a.id} d={`M${p.x} ${p.y - 9} L${p.x + 8} ${p.y + 6} L${p.x - 8} ${p.y + 6} Z`}
              className={`lo-alert lo-alert--${a.severity}`}
              onClick={onPick ? () => onPick({ kind: 'alert', id: a.id }) : undefined}
            >
              <title>{`${a.is_sos ? 'SOS: ' : ''}${a.title}`}</title>
            </path>
          );
        }) : null}
      </svg>
      <figcaption className="lo-map__note">
        Outlines to scale, north up. No map key is configured here, so there is no street map.
        Every driver, trip and alert on this map is also in the list view.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Google Maps
// ---------------------------------------------------------------------------

type Overlay = { setMap: (m: unknown) => void };

/** One absolutely placed hatched div per short cell, positioned from the map projection in draw(). */
function makeHatchOverlay(maps: any, cells: HeatCell[], onClick: (c: HeatCell) => void): Overlay {
  class Hatch extends maps.OverlayView {
    root: HTMLDivElement | null = null;
    onAdd() {
      this.root = document.createElement('div');
      this.root.className = 'lo-hatch-layer';
      for (const c of cells) {
        const el = document.createElement('div');
        el.className = 'lo-hatch';
        el.dataset.cell = `${c.row}:${c.col}`;
        el.addEventListener('click', () => onClick(c));
        this.root.appendChild(el);
      }
      this.getPanes().overlayMouseTarget.appendChild(this.root);
    }
    draw() {
      const proj = this.getProjection();
      if (!proj || !this.root) return;
      cells.forEach((c, i) => {
        const [south, west, north, east] = cellBounds(c);
        const sw = proj.fromLatLngToDivPixel(new maps.LatLng(south, west));
        const ne = proj.fromLatLngToDivPixel(new maps.LatLng(north, east));
        const el = this.root!.children[i] as HTMLElement;
        el.style.left = `${sw.x}px`;
        el.style.top = `${ne.y}px`;
        el.style.width = `${Math.max(2, ne.x - sw.x)}px`;
        el.style.height = `${Math.max(2, sw.y - ne.y)}px`;
      });
    }
    onRemove() { this.root?.remove(); this.root = null; }
  }
  return new Hatch() as unknown as Overlay;
}

const g = () => (window as unknown as { google?: any }).google;

function css(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function GoogleLiveMap({ zones, dots, trips, alerts, cells, layers, driverHref, windowMinutes, caption, focus, fill, onPick, follow }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<unknown>(null);
  const zoneOverlays = useRef<Overlay[]>([]);
  const cellOverlays = useRef<Overlay[]>([]);
  const tripOverlays = useRef<Overlay[]>([]);
  const alertOverlays = useRef<Overlay[]>([]);
  const driverMarkers = useRef(new Map<number, any>());
  const fitted = useRef(false);
  const [themeTick, setThemeTick] = useState(0);
  const hrefRef = useRef(driverHref);
  hrefRef.current = driverHref;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const ensureMap = useCallback(() => {
    const maps = g()?.maps;
    if (!maps || !host.current) return null;
    const palette = readMapPalette();
    if (!map.current) {
      map.current = new maps.Map(host.current, {
        center: { lat: 20.5, lng: 78.9 }, zoom: 5, disableDefaultUI: true, zoomControl: true,
        gestureHandling: 'cooperative', clickableIcons: false, styles: mapStyles(palette),
      });
    } else {
      (map.current as any).setOptions({ styles: mapStyles(palette) });
    }
    return map.current as any;
  }, []);

  const clear = (list: { current: Overlay[] }) => { for (const o of list.current) o.setMap(null); list.current = []; };

  // Zones: the outlines, and the view.
  useEffect(() => {
    const m = ensureMap();
    if (!m) return;
    clear(zoneOverlays);
    const maps = g().maps;
    const bounds = new maps.LatLngBounds();
    const stroke = css('--ops-ink-4', 'rgb(120,120,120)');
    const fit = focus && focus.length && zones.some((z) => z.city && focus.includes(z.city)) ? focus : null;
    for (const z of zones) {
      for (const ring of z.rings) {
        const path = ring.map(([lat, lng]) => ({ lat, lng }));
        zoneOverlays.current.push(new maps.Polygon({
          paths: path, map: m, clickable: false, strokeColor: stroke, strokeOpacity: 0.9, strokeWeight: 1.5,
          fillColor: stroke, fillOpacity: 0.05, zIndex: 1,
        }));
        if (!fit || (z.city && fit.includes(z.city))) for (const p of path) bounds.extend(p);
      }
    }
    if (!bounds.isEmpty()) { m.fitBounds(bounds, 40); fitted.current = true; }
  }, [zones, focus, themeTick, ensureMap]);

  // Short-of-drivers cells: hatched gold divs on an OverlayView (Rectangles cannot do patterns).
  useEffect(() => {
    const m = ensureMap();
    if (!m) return;
    clear(cellOverlays);
    if (!layers.heatmap) return;
    const maps = g().maps;
    const info = new maps.InfoWindow();
    const overlay = makeHatchOverlay(maps, cells.filter((c) => shadeLevel(c) > 0), (c: HeatCell) => {
      const [south, west, north, east] = cellBounds(c);
      info.setContent(cellSentence(c, windowMinutes));
      info.setPosition({ lat: (south + north) / 2, lng: (west + east) / 2 });
      info.open(m);
    });
    overlay.setMap(m);
    cellOverlays.current.push(overlay, { setMap: () => info.close() });
  }, [cells, layers.heatmap, windowMinutes, themeTick, zones, ensureMap]);

  // Trips: a line from pickup to drop, a dot at the pickup.
  useEffect(() => {
    const m = ensureMap();
    if (!m) return;
    clear(tripOverlays);
    if (!layers.trips) return;
    const maps = g().maps;
    const palette = readMapPalette();
    const quiet = css('--ops-ink-4', 'rgb(120,120,120)');
    for (const t of trips) {
      const colour = t.stale ? quiet : palette.gold;
      const line = new maps.Polyline({
        path: [{ lat: t.pickup_lat, lng: t.pickup_lng }, { lat: t.drop_lat, lng: t.drop_lng }], map: m,
        strokeColor: colour, strokeOpacity: t.stale ? 0.55 : 0.9, strokeWeight: 2, zIndex: 3,
        icons: t.stale ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 }, offset: '0', repeat: '10px' }] : undefined,
      });
      line.addListener('click', () => pickRef.current?.({ kind: 'trip', id: t.id }));
      tripOverlays.current.push(line);
      tripOverlays.current.push(new maps.Marker({
        position: { lat: t.pickup_lat, lng: t.pickup_lng }, map: m, zIndex: 4,
        title: `Trip ${t.id}, ${TRIP_STATE_WORDS[t.state] ?? t.state}`,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 3.5, fillColor: colour, fillOpacity: 1, strokeColor: palette.noir, strokeWeight: 1 },
      }));
    }
  }, [trips, layers.trips, themeTick, zones, ensureMap]);

  // Alerts: a pin where the server placed one (SOS), nowhere else.
  useEffect(() => {
    const m = ensureMap();
    if (!m) return;
    clear(alertOverlays);
    if (!layers.alerts) return;
    const maps = g().maps;
    const palette = readMapPalette();
    const danger = css('--ops-danger', 'rgb(220,90,60)');
    for (const a of alerts) {
      if (a.lat === null || a.lng === null) continue;
      const pin = new maps.Marker({
        position: { lat: a.lat, lng: a.lng }, map: m, zIndex: 8, title: `${a.is_sos ? 'SOS: ' : ''}${a.title}`,
        icon: { path: maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: danger, fillOpacity: 1, strokeColor: palette.noir, strokeWeight: 1.5 },
      });
      pin.addListener('click', () => pickRef.current?.({ kind: 'alert', id: a.id }));
      alertOverlays.current.push(pin);
    }
  }, [alerts, layers.alerts, themeTick, zones, ensureMap]);

  // Drivers: markers are kept by id and MOVED, not rebuilt, so a frame per second does not churn the map.
  useEffect(() => {
    const m = ensureMap();
    if (!m) return;
    const maps = g().maps;
    const palette = readMapPalette();
    const markers = driverMarkers.current;
    const want = layers.drivers ? dots : [];
    const keep = new Set(want.map((d) => d.driver_id));
    for (const [id, marker] of markers) {
      if (!keep.has(id)) { marker.setMap(null); markers.delete(id); }
    }
    for (const d of want) {
      const position = { lat: d.lat, lng: d.lng };
      const icon = {
        path: maps.SymbolPath.CIRCLE, scale: 5, fillOpacity: 1, strokeColor: palette.noir, strokeWeight: 1.5,
        fillColor: d.status === 'on_trip' ? palette.gold : palette.pickup,
      };
      const title = `Driver ${d.driver_id}, ${STATUS_WORDS[d.status].toLowerCase()}${d.vehicle_class ? `, ${d.vehicle_class}` : ''}`;
      const existing = markers.get(d.driver_id);
      if (existing) {
        existing.setPosition(position);
        existing.setIcon(icon);
        existing.setTitle(title);
        continue;
      }
      const marker = new maps.Marker({ position, map: m, icon, title, zIndex: 5 });
      marker.addListener('click', () => {
        if (pickRef.current) { pickRef.current({ kind: 'driver', id: d.driver_id }); return; }
        const href = hrefRef.current(d.driver_id);
        if (href) window.location.assign(href);
      });
      markers.set(d.driver_id, marker);
    }
  }, [dots, layers.drivers, themeTick, zones, ensureMap]);

  useEffect(() => {
    const m = map.current as any;
    if (!m || !follow) return;
    m.panTo({ lat: follow.lat, lng: follow.lng });
    if ((m.getZoom?.() ?? 0) < 14) m.setZoom(14);
  }, [follow]);

  useEffect(() => () => {
    for (const list of [zoneOverlays, cellOverlays, tripOverlays, alertOverlays]) clear(list);
    for (const marker of driverMarkers.current.values()) marker.setMap(null);
    driverMarkers.current.clear();
  }, []);

  return (
    <figure className={`lo-map ${fill ? 'lo-map--fill' : ''}`}>
      <div ref={host} className="lo-map__host" role="region" aria-label={caption} />
      <figcaption className="lo-map__note">
        Every driver, trip and alert on this map is also in the list view.
      </figcaption>
    </figure>
  );
}
