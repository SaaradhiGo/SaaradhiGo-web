/**
 * Draws the home hero maps (owner brief, 17 Nov): real roads, water and parks from OpenStreetMap,
 * the real road route between two landmarks, pins at the route's own ends and top-down cars set
 * on real roads. Output is static WebP in public/hero-map/, so a visit makes no map calls.
 *
 *   python -I scripts/hero-map/fetch_osm.py   # once, network; caches data/
 *   node scripts/hero-map/build_hero_maps.mjs # writes public/hero-map/*.webp and layout.json
 *
 * Map data (c) OpenStreetMap contributors, ODbL; the page shows the credit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const OUT = path.join(HERE, '..', '..', 'public', 'hero-map');
const CITIES = JSON.parse(fs.readFileSync(path.join(HERE, 'cities.json'), 'utf8'));

/** Two layouts: the desktop band beside the booking card, and the phone card under it. */
const VARIANTS = {
  desk: { w: 1600, h: 640, fit: [500, 400], scales: [1, 2], minor: true, cars: 7, carLen: 34 },
  phone: { w: 440, h: 260, fit: [300, 180], scales: [2, 3], minor: false, cars: 3, carLen: 24 },
};

const THEMES = {
  light: {
    land: '#EEE8DD', water: '#C9DDE6', waterLine: '#B3CEDA', green: '#D3E4CC', rail: '#C9C0B2',
    minor: '#F8F4EE', road: '#FFFFFF', major: '#FFFFFF', majorCase: '#E2D8C8', motorway: '#F4DCA8', motorwayCase: '#DDBF83',
    route: '#1B1A17', routeCase: '#FFFFFF', pickup: '#0D7762', drop: '#1B1A17', dropDot: '#F5A623', ring: '#FFFFFF',
    car: '#1B1A17', carRoof: '#2E2C28', carGlass: '#8EA2AB', carLight: '#FFF4D6', carTail: '#C7372F',
    mine: '#F5A623', mineRoof: '#FFC65C', mineGlass: '#1B1A17',
  },
  dark: {
    land: '#1A1916', water: '#16262C', waterLine: '#1D323A', green: '#1C2619', rail: '#34322D',
    minor: '#23221E', road: '#2D2B27', major: '#383530', majorCase: '#1A1916', motorway: '#4A4234', motorwayCase: '#2A2620',
    route: '#F5A623', routeCase: '#0B0B0B', pickup: '#2FB592', drop: '#F5A623', dropDot: '#0B0B0B', ring: '#0B0B0B',
    car: '#E9E3D8', carRoof: '#FFFFFF', carGlass: '#3A3F44', carLight: '#FFF4D6', carTail: '#E0554B',
    mine: '#F5A623', mineRoof: '#FFC65C', mineGlass: '#1B1A17',
  },
};

const ROADS = [
  // [match, width in px at the desktop scale, layer]
  [/^(motorway|trunk)(_link)?$/, 5.5, 'motorway'],
  [/^primary(_link)?$/, 4.2, 'major'],
  [/^secondary(_link)?$/, 3.4, 'major'],
  [/^tertiary(_link)?$/, 2.4, 'road'],
  [/^(residential|unclassified|living_street)$/, 1.1, 'minor'],
];

const load = (city, layer) => {
  const p = path.join(DATA, `${city}-${layer}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
};

/** Web Mercator in metres. */
const merc = ([lng, lat]) => {
  const R = 6378137;
  return [R * (lng * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
};

function projector(routeM, v) {
  const xs = routeM.map((p) => p[0]), ys = routeM.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(v.fit[0] / (x1 - x0), v.fit[1] / (y1 - y0)); // px per metre
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return ([mx, my]) => [v.w / 2 + (mx - cx) * k, v.h / 2 - (my - cy) * k];
}

/** Projected, rounded, de-duplicated path data; null when wholly off the stage. */
function pathD(pts, v, close = false) {
  const m = 40;
  if (!pts.some(([x, y]) => x > -m && x < v.w + m && y > -m && y < v.h + m)) return null;
  let d = '', last = null;
  for (const [x, y] of pts) {
    const p = `${x.toFixed(1)} ${y.toFixed(1)}`;
    if (p === last) continue;
    d += (d ? 'L' : 'M') + p;
    last = p;
  }
  return d + (close ? 'Z' : '');
}

/** A top-down car pointing up, centred on 0,0; `len` px long. */
function carSvg(t, len, mine) {
  const s = len / 32;
  const body = mine ? t.mine : t.car, roof = mine ? t.mineRoof : t.carRoof, glass = mine ? t.mineGlass : t.carGlass;
  return `<g transform="scale(${s.toFixed(3)})">
<ellipse cx="0" cy="1.5" rx="9.5" ry="17" fill="#000" opacity="0.22"/>
<rect x="-10.6" y="-11" width="2.4" height="4" rx="1.2" fill="${body}"/><rect x="8.2" y="-11" width="2.4" height="4" rx="1.2" fill="${body}"/>
<path d="M-6.5 -16 Q0 -17.4 6.5 -16 Q8.6 -15.2 8.8 -12 L8.8 12.5 Q8.6 15.6 6 16 Q0 16.8 -6 16 Q-8.6 15.6 -8.8 12.5 L-8.8 -12 Q-8.6 -15.2 -6.5 -16Z" fill="${body}"/>
<path d="M-6.6 -7.6 Q0 -9.6 6.6 -7.6 L5.6 -3 Q0 -4 -5.6 -3Z" fill="${glass}"/>
<rect x="-5.6" y="-3" width="11.2" height="9.6" rx="2" fill="${roof}"/>
<path d="M-5.6 6.6 Q0 7.4 5.6 6.6 L6.3 10.4 Q0 11.6 -6.3 10.4Z" fill="${glass}"/>
<rect x="-6.4" y="-15.6" width="3.2" height="1.6" rx="0.8" fill="${t.carLight}"/><rect x="3.2" y="-15.6" width="3.2" height="1.6" rx="0.8" fill="${t.carLight}"/>
<rect x="-6.6" y="14.4" width="3" height="1.3" rx="0.6" fill="${t.carTail}"/><rect x="3.6" y="14.4" width="3" height="1.3" rx="0.6" fill="${t.carTail}"/>
</g>`;
}

/** Seeded so a rebuild places the cars in the same spots. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const along = (pts, frac) => {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  let want = total * frac;
  for (let i = 0; i < seg.length; i++) {
    if (want <= seg[i] || i === seg.length - 1) {
      const f = seg[i] ? want / seg[i] : 0, a = pts[i], b = pts[i + 1];
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90 };
    }
    want -= seg[i];
  }
  return null;
};

/** A lake mapped as a relation arrives as loose outer ways; join them end to end into rings. */
function stitch(features) {
  const out = features.filter((f) => !f.rel);
  const byRel = new Map();
  for (const f of features) if (f.rel) byRel.set(f.rel, [...(byRel.get(f.rel) ?? []), f]);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  for (const parts of byRel.values()) {
    const left = parts.map((p) => p.g.slice());
    while (left.length) {
      let ring = left.shift();
      for (let grew = true; grew && !same(ring[0], ring.at(-1));) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const g = left[i];
          if (same(ring.at(-1), g[0])) ring = ring.concat(g.slice(1));
          else if (same(ring.at(-1), g.at(-1))) ring = ring.concat(g.slice(0, -1).reverse());
          else continue;
          left.splice(i, 1); grew = true; break;
        }
      }
      out.push({ t: parts[0].t, g: same(ring[0], ring.at(-1)) ? ring : ring.concat([ring[0]]) });
    }
  }
  return out;
}

/** Shortcuts a loop the route makes around its own end (a U-turn at the landmark): from the first
 *  point within 300 m of the end, it goes straight to the end. The pin stays at the true end. */
function trimEnds(routeM) {
  const end = routeM.at(-1);
  const i = routeM.findIndex((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) < 300);
  return [...routeM.slice(0, i + 1), end];
}

/** The point `dist` px along a polyline from its start, facing back toward the start. */
function backFrom(pts, dist) {
  for (let i = 1, run = 0; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + l >= dist) {
      const f = (dist - run) / l, a = pts[i - 1], b = pts[i];
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: (Math.atan2(a[1] - b[1], a[0] - b[0]) * 180) / Math.PI + 90 };
    }
    run += l;
  }
  return null;
}

function build(key, city, vname, v, tname, t) {
  const routeM = JSON.parse(fs.readFileSync(path.join(DATA, `${key}-route.json`), 'utf8')).coords.map(merc);
  const P = projector(routeM, v);
  const proj = (g) => g.map((c) => P(merc(c)));
  const sc = v.w === 1600 ? 1 : 0.8; // phone roads a touch thinner: the map is smaller
  const parts = [
    `<defs><radialGradient id="fg" gradientUnits="userSpaceOnUse" cx="${v.w / 2}" cy="${v.h / 2}" r="${Math.round(v.fit[0] * 1.15)}">`
    + '<stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>'
    + `<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${v.w}" height="${v.h}"><rect width="${v.w}" height="${v.h}" fill="url(#fg)"/></mask></defs>`,
    `<rect width="${v.w}" height="${v.h}" fill="${t.land}"/>`,
  ];

  for (const f of load(key, 'green')) {
    const d = pathD(proj(f.g), v, true);
    if (d) parts.push(`<path d="${d}" fill="${t.green}"/>`);
  }
  for (const f of stitch(load(key, 'water'))) {
    const pts = proj(f.g);
    const closed = f.g.length > 3 && f.g[0][0] === f.g.at(-1)[0] && f.g[0][1] === f.g.at(-1)[1];
    const d = pathD(pts, v, closed);
    if (!d) continue;
    if (closed && !f.t.waterway) parts.push(`<path d="${d}" fill="${t.water}"/>`);
    else if (f.t.waterway === 'riverbank') parts.push(`<path d="${d}" fill="${t.water}"/>`);
    else parts.push(`<path d="${d}" fill="none" stroke="${t.water}" stroke-width="${(5 * sc).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const f of load(key, 'rail')) {
    const d = pathD(proj(f.g), v);
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${t.rail}" stroke-width="1.4" stroke-dasharray="5 4"/>`);
  }

  // Roads, quietest first; casings under each class so junctions read cleanly.
  const roadsBy = ROADS.map(() => []);
  const carRoads = [];
  for (const layer of ['minor', 'major']) {
    if (layer === 'minor' && !v.minor) continue;
    for (const f of load(key, layer)) {
      const i = ROADS.findIndex(([re]) => re.test(f.t.highway || ''));
      if (i < 0) continue;
      const pts = proj(f.g);
      const d = pathD(pts, v);
      if (!d) continue;
      roadsBy[i].push(d);
      if (i <= 2 && !/_link$/.test(f.t.highway)) carRoads.push(pts);
    }
  }
  for (let i = ROADS.length - 1; i >= 0; i--) {
    const [, w, kind] = ROADS[i];
    if (!roadsBy[i].length) continue;
    const d = roadsBy[i].join('');
    const width = w * sc;
    if (kind === 'motorway') parts.push(`<path d="${d}" fill="none" stroke="${t.motorwayCase}" stroke-width="${(width + 2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (kind === 'major') parts.push(`<path d="${d}" fill="none" stroke="${t.majorCase}" stroke-width="${(width + 1.6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (let i = ROADS.length - 1; i >= 0; i--) {
    const [, w, kind] = ROADS[i];
    if (!roadsBy[i].length) continue;
    // Side streets fade out toward the edges, so the data's own boundary never shows.
    const mask = kind === 'minor' ? ' mask="url(#fade)"' : '';
    parts.push(`<path${mask} d="${roadsBy[i].join('')}" fill="none" stroke="${t[kind]}" stroke-width="${(w * sc).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // The route, its casing, and the pins at its own two ends.
  const route = trimEnds(routeM).map(P);
  if (process.env.HERO_CITY_ONLY) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${v.w}" height="${v.h}" viewBox="0 0 ${v.w} ${v.h}">${parts.join('')}</svg>`;
    return { svg, pins: { pickup: [0, 0], drop: [0, 0] } };
  }
  const rd = pathD(route, v);
  const rw = vname === 'desk' ? 5 : 4.2;
  parts.push(`<path d="${rd}" fill="none" stroke="${t.routeCase}" stroke-width="${rw + 5}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`);
  parts.push(`<path d="${rd}" fill="none" stroke="${t.route}" stroke-width="${rw}" stroke-linecap="round" stroke-linejoin="round"/>`);

  // Cars: the assigned driver on the route a little way from pickup, heading to it, and
  // others on main roads away from the pins and from each other.
  const [ax, ay] = route[0], [bx, by] = route.at(-1);
  const cars = [];
  const mine = backFrom(route, v.carLen * 2.6);
  if (mine) cars.push({ ...mine, mine: true });
  const rand = rng(vname === 'desk' ? 17 : 23);
  const zone = vname === 'desk'
    ? { x0: v.w / 2 - 330, x1: v.w / 2 + 360, y0: 40, y1: v.h - 40 }
    : { x0: 70, x1: v.w - 70, y0: 26, y1: v.h - 26 };
  const card = vname === 'desk' && city.deskCard
    ? { x0: v.w / 2 + city.deskCard[0] - 20, y0: v.h / 2 + city.deskCard[1] - 20, x1: v.w / 2 + city.deskCard[0] + 290, y1: v.h / 2 + city.deskCard[1] + 170 }
    : null;
  const ok = (x, y) => !(card && x > card.x0 && x < card.x1 && y > card.y0 && y < card.y1) && x > zone.x0 && x < zone.x1 && y > zone.y0 && y < zone.y1
    && Math.hypot(x - ax, y - ay) > v.carLen * 2 && Math.hypot(x - bx, y - by) > v.carLen * 2
    && cars.every((c) => Math.hypot(c.x - x, c.y - y) > v.carLen * (vname === 'desk' ? 4 : 3));
  for (let tries = 0; tries < 4000 && cars.length < v.cars + 1; tries++) {
    const r = carRoads[Math.floor(rand() * carRoads.length)];
    if (!r || r.length < 2) continue;
    const c = along(r, rand());
    if (c && ok(c.x, c.y)) cars.push({ ...c, ang: c.ang + (rand() < 0.5 ? 180 : 0), mine: false });
  }
  for (const c of cars) parts.push(`<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${c.ang.toFixed(1)})">${carSvg(t, v.carLen, c.mine)}</g>`);

  const pr = vname === 'desk' ? 9 : 8;
  parts.push(`<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${pr * 2}" fill="${t.pickup}" opacity="0.2"/>`);
  parts.push(`<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${pr}" fill="${t.pickup}" stroke="${t.ring}" stroke-width="3"/>`);
  const ds = pr * 2.6;
  parts.push(`<rect x="${(bx - ds / 2).toFixed(1)}" y="${(by - ds / 2).toFixed(1)}" width="${ds}" height="${ds}" rx="6" fill="${t.drop}" stroke="${t.ring}" stroke-width="3"/>`);
  parts.push(`<rect x="${(bx - ds / 5).toFixed(1)}" y="${(by - ds / 5).toFixed(1)}" width="${(ds / 2.5).toFixed(1)}" height="${(ds / 2.5).toFixed(1)}" rx="2" fill="${t.dropDot}"/>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${v.w}" height="${v.h}" viewBox="0 0 ${v.w} ${v.h}">${parts.join('')}</svg>`;
  return { svg, pins: { pickup: [Math.round(ax), Math.round(ay)], drop: [Math.round(bx), Math.round(by)] } };
}

fs.mkdirSync(OUT, { recursive: true });
const layout = {};
for (const [key, city] of Object.entries(CITIES)) {
  if (!fs.existsSync(path.join(DATA, `${key}-route.json`))) { console.log(key, 'no data, skipped'); continue; }
  layout[key] = { from: city.from.name, to: city.to.name, deskCard: city.deskCard ?? null, labels: city.labels ?? {} };
  for (const [vname, v] of Object.entries(VARIANTS)) {
    for (const [tname, t] of Object.entries(THEMES)) {
      const { svg, pins } = build(key, city, vname, v, tname, t);
      layout[key][vname] = { w: v.w, h: v.h, ...pins };
      for (const s of v.scales) {
        const file = path.join(OUT, `${key}-${vname}-${tname}${process.env.HERO_CITY_ONLY ? '-city' : ''}@${s}x.webp`);
        await sharp(Buffer.from(svg), { density: 72 * s }).webp({ quality: 82, effort: 6 }).toFile(file);
        console.log(path.basename(file), Math.round(fs.statSync(file).size / 1024) + ' KB');
      }
      if (process.env.KEEP_SVG) fs.writeFileSync(path.join(HERE, 'data', `${key}-${vname}-${tname}.svg`), svg);
    }
  }
}
if (!Object.keys(layout).length) { console.log('no city data in scripts/hero-map/data: run fetch_osm.py first'); process.exit(1); }
if (!process.env.HERO_CITY_ONLY) fs.writeFileSync(path.join(HERE, '..', '..', 'src', 'components', 'home', 'heroMapLayout.json'), JSON.stringify(layout, null, 2) + '\n');
