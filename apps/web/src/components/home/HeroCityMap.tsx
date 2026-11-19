import type { ReactNode } from 'react';
import layoutJson from './heroMapLayout.json';

/**
 * The home hero's map (owner, 17 Nov): a real city map drawn once at build time from
 * OpenStreetMap (scripts/hero-map), served as a theme- and size-matched WebP. No map calls per visit.
 * Hyderabad shows HITEC City to Charminar; a US visitor sees Boise State to The Village at Meridian.
 *
 * One fluid panel: while the panel is wide enough for the route and its labels (720px), it shows the wide
 * drawing with labelled pins; narrower, the compact drawing at its own aspect ratio. The driver card
 * sits under the map, never over the route.
 */
type Place = { pickup: number[]; drop: number[]; w: number; h: number };
type CityLayout = { from: string; to: string; deskCard: number[] | null; labels?: Record<string, string>; desk: Place; phone: Place };
const layout = layoutJson as unknown as Record<string, CityLayout>;

export function cityForMarket(market: string): string {
  return market === 'US' && layout.boise ? 'boise' : 'hyderabad';
}

const CREDIT = '© OpenStreetMap contributors';

export function HeroMapPanel({ market, pickup, drop, card }: { market: string; pickup: string; drop: string; card: ReactNode }) {
  const key = cityForMarket(market);
  const c = layout[key];
  const d = c.desk;
  const label = `Map of a trip from ${c.from} to ${c.to}`;
  return (
    <div className="hmap">
      <div className="hmap__view" role="img" aria-label={label}>
        <div className={`hmap-stage hmap--${key}-desk`} style={{ width: d.w, height: d.h }} data-overlay-host="">
          <span className={`hmap-pin hmap-pin--${c.labels?.pickup ?? 'above'}`} style={{ left: d.pickup[0], top: d.pickup[1] }}><b>{pickup}</b> {c.from}</span>
          <span className={`hmap-pin hmap-pin--dark hmap-pin--${c.labels?.drop ?? 'above'}`} style={{ left: d.drop[0], top: d.drop[1] }}><b>{drop}</b> {c.to}</span>
        </div>
        <div className={`hmap-photo hmap--${key}-photo`} />
        <span className="hmap-credit">{CREDIT}</span>
      </div>
      <div className="hmap__foot">{card}</div>
    </div>
  );
}
