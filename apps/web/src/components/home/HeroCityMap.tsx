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

const CITY_NAME: Record<string, string> = { hyderabad: 'Hyderabad', boise: 'Boise' };

/**
 * 20 Nov (owner: "why am I seeing this fixed route on prod?"): the panel shows the city itself,
 * with no made-up trip, cars or "driver on the way". The visitor's own route appears on the real
 * map once they choose places and press See fares.
 */
export function HeroMapPanel({ market, status, card }: { market: string; status: string; card: ReactNode }) {
  const key = cityForMarket(market);
  const d = layout[key].desk;
  const city = CITY_NAME[key] ?? key;
  return (
    <div className="hmap">
      <div className="hmap__view" role="img" aria-label={`Map of ${city}`}>
        <div className={`hmap-stage hmap--${key}-desk-city`} style={{ width: d.w, height: d.h }} />
        <div className={`hmap-photo hmap--${key}-photo-city`} />
        <span className="hmap-city"><span className="hmap-city__dot" aria-hidden="true" />{status}</span>
        <span className="hmap-credit">{CREDIT}</span>
      </div>
      <div className="hmap__foot">{card}</div>
    </div>
  );
}
