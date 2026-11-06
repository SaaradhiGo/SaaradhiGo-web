// Builds the SaaradhiGo badge in every cut and colourway, and the icon PNGs.
// DRAFT artwork: to be redrawn by the illustrator with the full logo.
//
//   node generate.mjs <path-to-node_modules-containing-sharp>
//
// The knock-outs (the road inside the sail, the hole in the pin) are a mask,
// not a background-coloured shape, so every badge is transparent and the
// one-colour versions work on any ground.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(process.argv[2] ?? here, 'noop.js'));
const sharp = require('sharp');

// Shapes per cut, from the brief. `k` = knocked out of the gold.
const CUTS = {
  full: {
    ring: { r: 50, w: 5 },
    fill: [
      'M76 36C56 50 38 70 30 92H86C80 72 78 54 76 36Z',
      'M60 42C60 42 50 32 50 26A10 10 0 0 1 70 26C70 32 60 42 60 42Z',
    ],
    knock: [
      'M50 92C58 70 68 54 75 40L77 41C74 56 72 72 70 92Z',
      { circle: [60, 26, 3.6] },
    ],
    // The road's centre dashes and the ground line are gold strokes.
    strokes: [
      { d: 'M60 90C64 72 70 56 76 42', w: 1.4, dash: '3.5 3.5' },
      { d: 'M24 98H96', w: 3.2, cap: 'round' },
    ],
  },
  small: {
    ring: { r: 49, w: 8 },
    fill: [
      'M76 36C56 50 38 70 30 92H86C80 72 78 54 76 36Z',
      'M60 44C60 44 49 34 49 27A11 11 0 0 1 71 27C71 34 60 44 60 44Z',
    ],
    knock: ['M50 92C58 70 68 54 75 40L77 41C74 56 72 72 70 92Z'],
    strokes: [],
  },
  favicon: {
    ring: { r: 48, w: 10 },
    fill: [
      'M78 30C56 48 36 70 28 96H90C82 74 80 52 78 30Z',
      'M60 40C60 40 49 30 49 23A11 11 0 0 1 71 23C71 30 60 40 60 40Z',
    ],
    knock: [],
    strokes: [],
  },
  // 16px: the favicon cut with the pin dropped.
  favicon16: {
    ring: { r: 48, w: 10 },
    fill: ['M78 30C56 48 36 70 28 96H90C82 74 80 52 78 30Z'],
    knock: [],
    strokes: [],
  },
};

const COLOURS = {
  'gold': '#FFD700', // screens
  'classic-gold': '#D6A83E', // print
  'deep-gold': '#7A6000', // light grounds
  'black': '#000000',
  'white': '#FFFFFF',
};

function shapes(cut, colour, id) {
  const c = CUTS[cut];
  const knock = c.knock
    .map((k) => (typeof k === 'string'
      ? `<path d="${k}" fill="#000"/>`
      : `<circle cx="${k.circle[0]}" cy="${k.circle[1]}" r="${k.circle[2]}" fill="#000"/>`))
    .join('');
  const fills = c.fill.map((d) => `<path d="${d}"/>`).join('');
  const strokes = c.strokes
    .map((s) => `<path d="${s.d}" fill="none" stroke="${colour}" stroke-width="${s.w}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.cap ? ` stroke-linecap="${s.cap}"` : ''}/>`)
    .join('');
  return `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><rect width="120" height="120" fill="#fff"/>${knock}</mask></defs>`
    + `<circle cx="60" cy="62" r="${c.ring.r}" fill="none" stroke="${colour}" stroke-width="${c.ring.w}"/>`
    + `<g fill="${colour}" mask="url(#${id})">${fills}</g>${strokes}`;
}

function badgeSvg(cut, colour) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${shapes(cut, colour, `k-${cut}`)}</svg>\n`;
}

// An icon tile: badge at `scale` of the tile, centred, on a solid ground.
function tileSvg(cut, colour, ground, { scale = 0.8, round = 0 } = {}) {
  const inset = (120 - 120 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`
    + `<rect width="120" height="120" rx="${round}" fill="${ground}"/>`
    + `<g transform="translate(${inset} ${inset - 2 * scale}) scale(${scale})">${shapes(cut, colour, `k-${cut}`)}</g></svg>\n`;
}

// The driver's car on the rider's map: favicon cut, gold on a black disc,
// white 3px ring (at 48px; scaled with the image).
function markerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">`
    + `<circle cx="60" cy="60" r="56" fill="#000"/><circle cx="60" cy="60" r="56.25" fill="none" stroke="#fff" stroke-width="7.5"/>`
    + `<g transform="translate(15 13) scale(0.75)">${shapes('favicon', '#FFD700', 'k-m')}</g></svg>\n`;
}

const cutFor = (px) => (px >= 96 ? 'full' : px > 32 ? 'small' : px > 16 ? 'favicon' : 'favicon16');

const out = (p, s) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, s); };
const png = (svg, px, file) => (mkdirSync(path.dirname(file), { recursive: true }), sharp(Buffer.from(svg), { density: Math.max(72, (px / 120) * 72 * 4) })
  .resize(px, px).png().toFile(file));

// 1. Transparent badges: every cut x colour.
for (const cut of ['full', 'small', 'favicon']) {
  for (const [name, hex] of Object.entries(COLOURS)) {
    out(path.join(here, 'svg', `badge-${cut}-${name}.svg`), badgeSvg(cut, hex));
  }
}
// 2. Tiles named in the brief.
const TILES = {
  'gold-on-black': ['#FFD700', '#000000'], // rider icon, screens
  'classic-gold-on-black': ['#D6A83E', '#000000'], // print
  'deep-gold-on-light': ['#7A6000', '#FAF7F2'], // light pages, letters
  'black-on-classic-gold': ['#000000', '#D6A83E'], // driver icon, signage
};
for (const [name, [g, bg]] of Object.entries(TILES)) {
  for (const cut of ['full', 'small', 'favicon']) {
    out(path.join(here, 'svg', `tile-${cut}-${name}.svg`), tileSvg(cut, g, bg));
  }
}
out(path.join(here, 'svg', 'map-marker-driver.svg'), markerSvg());

// 3. PNG sets. Rider and web: gold on black. Driver: black on classic gold.
const SIZES = [1024, 512, 192, 180, 167, 152, 120, 96, 72, 48, 32, 16];
const jobs = [];
for (const [app, [g, bg]] of Object.entries({ rider: TILES['gold-on-black'], driver: TILES['black-on-classic-gold'] })) {
  for (const px of SIZES) {
    jobs.push(png(tileSvg(cutFor(px), g, bg), px, path.join(here, 'png', app, `icon-${px}.png`)));
  }
  // Maskable: the badge inside the 80% safe zone (badge at 64% of the tile).
  jobs.push(png(tileSvg('full', g, bg, { scale: 0.64 }), 512, path.join(here, 'png', app, 'icon-maskable-512.png')));
  jobs.push(png(tileSvg('full', g, bg, { scale: 0.64 }), 192, path.join(here, 'png', app, 'icon-maskable-192.png')));
  // Android adaptive foreground: 108dp canvas, badge inside the 66dp circle.
  for (const [d, px] of Object.entries({ mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 })) {
    const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g transform="translate(${(120 - 120 * 0.58) / 2} ${(120 - 120 * 0.58) / 2}) scale(0.58)">${shapes('full', g, 'k-fg')}</g></svg>`;
    jobs.push(png(fg, px, path.join(here, 'png', app, 'android', `mipmap-${d}`, 'ic_launcher_foreground.png')));
  }
  for (const [d, px] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
    jobs.push(png(tileSvg(cutFor(px), g, bg), px, path.join(here, 'png', app, 'android', `mipmap-${d}`, 'ic_launcher.png')));
    // Notification small icon: one colour (white), small cut, 24dp.
    const npx = px / 2;
    jobs.push(png(badgeSvg(npx >= 48 ? 'small' : 'favicon', '#FFFFFF'), npx, path.join(here, 'png', app, 'android', `drawable-${d}`, 'ic_stat_notify.png')));
  }
}
// Map marker for the rider app: 1x/2x/3x of 40dp.
for (const [s, px] of Object.entries({ '1x': 40, '2x': 80, '3x': 120 })) {
  jobs.push(png(markerSvg(), px, path.join(here, 'png', 'marker', `driver-car-${s}.png`)));
}
await Promise.all(jobs);
console.log(`badge: ${jobs.length} PNGs written`);
