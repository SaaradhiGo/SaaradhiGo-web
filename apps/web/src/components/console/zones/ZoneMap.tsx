'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { loadGoogleMaps, mapsConfigured } from '@/lib/googleMaps';
import { mapStyles, readMapPalette } from '@/lib/mapStyle';
import { boundsOf, makeProjector, ringPath, type Position } from '@/lib/zones';

/**
 * The map of zones: Google Maps when the build has a browser key, a scaled SVG outline
 * when it does not.
 *
 * ONE MAP VENDOR. This reuses the Google Maps JS the console already loads
 * (`lib/googleMaps.ts`, the referrer-restricted browser key). It adds no other tile
 * provider and no npm package, and it does NOT use the Drawing library (deprecated and
 * removed): the editable draft is a plain `google.maps.Polygon` with `editable: true`.
 *
 * WITHOUT A KEY THE PAGE STILL WORKS. The local fixture stack and any build with no
 * `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` draw every polygon as an outline scaled to fit
 * (north up, longitude scaled by cos(latitude)), clickable to test a point, and the
 * editor falls back to a latitude/longitude table. It says so, in a line under the map,
 * rather than pretending to be a street map.
 */

export type MapTone = 'live' | 'inactive' | 'selected' | 'compare';

export type MapZone = {
  key: string;
  label: string;
  rings: Position[][];
  tone: MapTone;
};

export type PointMark = { lat: number; lng: number } | null;

const W = 720;
const H = 420;

type Props = {
  zones: MapZone[];
  /** The draft's outline (open ring), drawn editable on Google Maps. */
  draftRing?: Position[] | null;
  /** Called with the new open ring when a corner is dragged, added or removed. */
  onDraftRing?: (ring: Position[]) => void;
  /** A tested point. */
  point?: PointMark;
  /** A click on the map (not on a zone) when point testing is on. */
  onPoint?: (lat: number, lng: number) => void;
  /** A click on a zone. */
  onZone?: (key: string) => void;
  caption: string;
  height?: number;
  /** Rings that decide the view (the zone being looked at or drawn); the rest is context, clipped. */
  fit?: Position[][] | null;
};

export function ZoneMap(props: Props) {
  // Whether Google Maps can be used is decided once the library has loaded; until then (and
  // when there is no key, or the key is refused) the outline is shown.
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

  return live ? <GoogleZoneMap {...props} /> : <OutlineZoneMap {...props} />;
}

// ---------------------------------------------------------------------------
// The scaled outline
// ---------------------------------------------------------------------------

function OutlineZoneMap({ zones, draftRing, point, onPoint, onZone, caption, fit }: Props) {
  const rings = useMemo(() => {
    const all: Position[][] = zones.flatMap((z) => z.rings);
    if (draftRing && draftRing.length >= 3) all.push(draftRing);
    return all;
  }, [zones, draftRing]);
  const bounds = useMemo(() => {
    const focus = [...(fit ?? []), ...(draftRing && draftRing.length >= 3 ? [draftRing] : [])];
    const b = boundsOf(focus.length ? focus : rings);
    if (!b || !focus.length) return b;
    const padLng = (b.maxLng - b.minLng) * 0.6 || 0.01;
    const padLat = (b.maxLat - b.minLat) * 0.6 || 0.01;
    return { minLng: b.minLng - padLng, maxLng: b.maxLng + padLng, minLat: b.minLat - padLat, maxLat: b.maxLat + padLat };
  }, [rings, fit, draftRing]);
  const projector = useMemo(() => (bounds ? makeProjector(bounds, W, H, 28) : null), [bounds]);

  if (!bounds || !projector) {
    return (
      <div className="zn-map">
        <p className="zn-map__empty">Nothing to draw yet. Add at least three corners and the outline appears here.</p>
      </div>
    );
  }

  function click(e: React.MouseEvent<SVGSVGElement>) {
    if (!onPoint || !projector) return;
    const svg = e.currentTarget;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    const { lat, lng } = projector.unproject(x, y);
    onPoint(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
  }

  const mark = point ? projector.project([point.lng, point.lat]) : null;
  return (
    <figure className="zn-map">
      <svg
        className="zn-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={caption}
        onClick={click}
      >
        {zones.map((z) => z.rings.map((ring, i) => (
          <path
            key={`${z.key}-${i}`} d={ringPath(ring, projector)}
            className={`zn-poly zn-poly--${z.tone}`}
            role={onZone ? 'button' : undefined} tabIndex={onZone ? 0 : undefined}
            aria-label={onZone ? `${z.label}${z.tone === 'inactive' ? ', inactive' : ''}. Open this zone.` : undefined}
            onClick={onZone ? (e) => { e.stopPropagation(); onZone(z.key); } : undefined}
            onKeyDown={onZone ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZone(z.key); } } : undefined}
          >
            {onZone ? null : <title>{z.label}</title>}
          </path>
        )))}
        {zones.filter((z) => z.rings[0]).map((z) => {
          const c = centroid(z.rings[0], projector);
          if (c.x < 20 || c.x > W - 20 || c.y < 12 || c.y > H - 12) return null;
          return <text key={`t-${z.key}`} x={c.x} y={c.y} className="zn-label" textAnchor="middle">{z.key}</text>;
        })}
        {draftRing && draftRing.length >= 3 ? (
          <>
            <path d={ringPath(draftRing, projector)} className="zn-poly zn-poly--draft" />
            {draftRing.map((p, i) => {
              const { x, y } = projector.project(p);
              return <circle key={i} cx={x} cy={y} r={4.5} className="zn-vertex"><title>{`Corner ${i + 1}`}</title></circle>;
            })}
          </>
        ) : null}
        {mark ? <circle cx={mark.x} cy={mark.y} r={6} className="zn-point"><title>Tested point</title></circle> : null}
      </svg>
      <figcaption className="zn-map__note">
        Outlines to scale, north up. No map key is configured here, so there is no street map
        {onPoint ? '; click anywhere to test a point' : ''}.
      </figcaption>
    </figure>
  );
}

function centroid(ring: Position[], p: ReturnType<typeof makeProjector>) {
  const pts = ring.map((r) => p.project(r));
  return {
    x: pts.reduce((s, q) => s + q.x, 0) / pts.length,
    y: pts.reduce((s, q) => s + q.y, 0) / pts.length,
  };
}

// ---------------------------------------------------------------------------
// Google Maps
// ---------------------------------------------------------------------------

type Overlay = { setMap: (m: unknown) => void };

function GoogleZoneMap({ zones, draftRing, onDraftRing, point, onPoint, onZone, caption, height = 420, fit }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<unknown>(null);
  const overlays = useRef<Overlay[]>([]);
  const draftPoly = useRef<unknown>(null);
  const fitted = useRef(false);
  const [themeTick, setThemeTick] = useState(0);
  // Handlers are read through refs so a re-render never rebuilds the map.
  const onDraft = useRef(onDraftRing);
  const onPt = useRef(onPoint);
  const onZ = useRef(onZone);
  onDraft.current = onDraftRing;
  onPt.current = onPoint;
  onZ.current = onZone;

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // The existing zones and the tested point.
  useEffect(() => {
    const g = (window as unknown as { google?: any }).google;
    if (!g?.maps || !host.current) return;
    const palette = readMapPalette();
    if (!map.current) {
      map.current = new g.maps.Map(host.current, {
        center: { lat: 20.5, lng: 78.9 }, zoom: 5, disableDefaultUI: true, zoomControl: true,
        gestureHandling: 'cooperative', clickableIcons: false, styles: mapStyles(palette),
      });
      (map.current as any).addListener('click', (e: any) => {
        if (onPt.current && e.latLng) onPt.current(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6)));
      });
    } else {
      (map.current as any).setOptions({ styles: mapStyles(palette) });
    }
    const m = map.current as any;
    for (const o of overlays.current) o.setMap(null);
    overlays.current = [];

    const bounds = new g.maps.LatLngBounds();
    const colour = (tone: MapTone) => (tone === 'live' ? palette.pickup : tone === 'selected' ? palette.gold
      : tone === 'compare' ? palette.surface : palette.label);
    for (const z of zones) {
      for (const ring of z.rings) {
        const path = ring.map(([lng, lat]) => ({ lat, lng }));
        const poly = new g.maps.Polygon({
          paths: path, map: m, clickable: Boolean(onZ.current),
          strokeColor: colour(z.tone), strokeOpacity: z.tone === 'inactive' ? 0.6 : 0.95,
          strokeWeight: z.tone === 'selected' ? 3 : 2, fillColor: colour(z.tone),
          fillOpacity: z.tone === 'selected' ? 0.2 : z.tone === 'compare' ? 0 : 0.12, zIndex: z.tone === 'selected' ? 2 : 1,
        });
        poly.addListener('click', (e: any) => {
          if (onZ.current) onZ.current(z.key);
          else if (onPt.current && e.latLng) onPt.current(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6)));
        });
        overlays.current.push(poly);
        if (!fit || fit.length === 0) for (const p of path) bounds.extend(p);
      }
    }
    for (const ring of fit ?? []) for (const [lng, lat] of ring) bounds.extend({ lat, lng });
    if (point) {
      overlays.current.push(new g.maps.Marker({
        position: { lat: point.lat, lng: point.lng }, map: m, title: 'Tested point', zIndex: 9,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 7, fillColor: palette.gold, fillOpacity: 1,
          strokeColor: palette.noir, strokeWeight: 2 },
      }));
    }
    if (!fitted.current && !bounds.isEmpty()) {
      m.fitBounds(bounds, 40);
      fitted.current = true;
    }
  }, [zones, point, themeTick, fit]);

  // The draft: ONE editable polygon, created once and then kept in step with the rows.
  useEffect(() => {
    const g = (window as unknown as { google?: any }).google;
    const m = map.current as any;
    if (!g?.maps || !m) return;
    const palette = readMapPalette();
    const ring = draftRing && draftRing.length >= 3 ? draftRing : null;
    if (!ring) {
      (draftPoly.current as any)?.setMap(null);
      draftPoly.current = null;
      return;
    }
    const path = ring.map(([lng, lat]) => ({ lat, lng }));
    if (!draftPoly.current) {
      const poly = new g.maps.Polygon({
        paths: path, map: m, editable: Boolean(onDraft.current), draggable: false, zIndex: 5,
        strokeColor: palette.gold, strokeOpacity: 1, strokeWeight: 3, fillColor: palette.gold, fillOpacity: 0.18,
      });
      const read = () => {
        const pts = (poly.getPath().getArray() as any[]).map((ll) => [ll.lng(), ll.lat()] as Position);
        onDraft.current?.(pts);
      };
      const p = poly.getPath();
      p.addListener('set_at', read);
      p.addListener('insert_at', read);
      p.addListener('remove_at', read);
      draftPoly.current = poly;
      const bounds = new g.maps.LatLngBounds();
      for (const q of path) bounds.extend(q);
      if (!bounds.isEmpty()) m.fitBounds(bounds, 60);
      return;
    }
    // Rows were edited in the table: replace the path only if it really differs (an echo of a
    // drag must not reset the vertex being dragged).
    const poly = draftPoly.current as any;
    const current = (poly.getPath().getArray() as any[]).map((ll) => [ll.lng(), ll.lat()]);
    const same = current.length === ring.length
      && current.every((c, i) => Math.abs(c[0] - ring[i][0]) < 1e-9 && Math.abs(c[1] - ring[i][1]) < 1e-9);
    if (!same) poly.setPath(path);
  }, [draftRing, themeTick]);

  useEffect(() => () => {
    for (const o of overlays.current) o.setMap(null);
    (draftPoly.current as any)?.setMap(null);
  }, []);

  return (
    <figure className="zn-map">
      <div ref={host} className="zn-map__host" style={{ height }} role="region" aria-label={caption} />
      <figcaption className="zn-map__note">
        {onDraftRing ? 'Drag a corner to move it; drag the small midpoint handle on an edge to add one. ' : ''}
        {onPoint ? 'Click the map to test a point.' : ''}
      </figcaption>
    </figure>
  );
}
