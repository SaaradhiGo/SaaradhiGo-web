import type { ReactNode } from 'react';
import layoutJson from './heroMapLayout.json';

/**
 * The home hero's map (owner, 17 Nov): a real city map drawn once at build time from
 * OpenStreetMap (scripts/hero-map), served as a theme- and size-matched WebP. No map calls per visit.
 * Hyderabad shows HITEC City to Charminar; a US visitor sees Boise State to The Village at Meridian.
 */
type Place = { pickup: number[]; drop: number[]; w: number; h: number };
type CityLayout = { from: string; to: string; deskCard: number[] | null; labels?: Record<string, string>; desk: Place; phone: Place };
const layout = layoutJson as unknown as Record<string, CityLayout>;

export function cityForMarket(market: string): string {
  return market === 'US' && layout.boise ? 'boise' : 'hyderabad';
}

const CREDIT = '© OpenStreetMap contributors';

/** Desktop: the band to the right of the booking card, with the pins' labels and the status card. */
export function HeroCityMapSide({ market, pickup, drop, card }: { market: string; pickup: string; drop: string; card: ReactNode }) {
  const key = cityForMarket(market);
  const c = layout[key];
  const d = c.desk;
  const pin = (p: number[], where: string) => ({ left: p[0], top: p[1], className: `hmap-pin hmap-pin--${where}` });
  const pu = pin(d.pickup, c.labels?.pickup ?? 'above');
  const dr = pin(d.drop, c.labels?.drop ?? 'above');
  // The stage is centred in the band, so the band's centre is the route's centre at every width.
  return (
    <div className="hmap-side">
      <div className={`hmap-stage hmap--${key}-desk`} style={{ width: d.w, height: d.h }}
        role="img" aria-label={`Map of a trip from ${c.from} to ${c.to}`}>
        <span className={pu.className} style={{ left: pu.left, top: pu.top }}><b>{pickup}</b> {c.from}</span>
        <span className={`${dr.className} hmap-pin--dark`} style={{ left: dr.left, top: dr.top }}><b>{drop}</b> {c.to}</span>
      </div>
      {c.deskCard && (
        <div className="hmap-card" style={{ ['--cx' as string]: `${c.deskCard[0]}px`, ['--cy' as string]: `${c.deskCard[1]}px` }}>{card}</div>
      )}
      <span className="hmap-credit">{CREDIT}</span>
    </div>
  );
}

/** Phone and tablet: the map as a card under the booking panel, the status card as its foot. */
export function HeroCityMapCard({ market, card }: { market: string; card: ReactNode }) {
  const key = cityForMarket(market);
  const c = layout[key];
  return (
    <div className="hmap-cardwrap">
      <div className={`hmap-photo hmap--${key}-card`} role="img" aria-label={`Map of a trip from ${c.from} to ${c.to}`}>
        <span className="hmap-credit">{CREDIT}</span>
      </div>
      <div className="hmap-foot">{card}</div>
    </div>
  );
}
