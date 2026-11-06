/**
 * The hybrid design's colour rules, read straight from src/styles/tokens.css.
 *
 * Every text pair reads at 4.5:1 and every control edge at 3:1, in BOTH
 * themes (owner, 2026-11-05). When a pair fails, the fix is a lighter or
 * darker token, never a dropped assertion. And the cool slate greys the old
 * palette used are gone from the public palette (the console keeps its own
 * pinned copy under `.ops` / `.login`, which this does not read).
 * Run with `npm test` (node:test; no framework).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `no ${selector} block in tokens.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const THEMES = {
  dark: block('[data-theme="dark"], .sg-on-noir:not(.login__brand)'),
  light: block(':root:not([data-theme="dark"]), [data-theme="light"]'),
};

type RGBA = [number, number, number, number];
function parse(v: string): RGBA {
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  assert.ok(rgba, `cannot parse colour ${v}`);
  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
}
function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1) as RGBA;
}
function lum([r, g, b]: RGBA) {
  const c = [r, g, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: RGBA, b: RGBA) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

for (const [name, t] of Object.entries(THEMES)) {
  const c = (k: string) => {
    assert.ok(t[k], `${name}: token --${k} missing`);
    return parse(t[k]);
  };
  const grounds = ['bg-000', 'bg-100', 'bg-200'];

  test(`${name}: text reads at 4.5:1 on every ground`, () => {
    for (const fg of ['ink', 'ink-muted', 'ink-subtle', 'gold-text', 'success', 'danger', 'pickup']) {
      for (const bg of grounds) {
        const r = ratio(c(fg), c(bg));
        assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1`);
      }
    }
  });

  test(`${name}: text on the gold, danger and soft-gold fills`, () => {
    assert.ok(ratio(c('on-gold'), c('gold-500')) >= 4.5, `${name}: on-gold on gold-500`);
    assert.ok(ratio(c('on-danger'), c('danger')) >= 4.5, `${name}: on-danger on danger`);
    const soft = over(c('gold-soft'), c('bg-100'));
    assert.ok(ratio(c('ink'), soft) >= 4.5, `${name}: ink on a selected (gold-soft) row`);
  });

  test(`${name}: control edges at 3:1`, () => {
    for (const bg of grounds) {
      const r = ratio(c('line-strong'), c(bg));
      assert.ok(r >= 3, `${name}: --line-strong on --${bg} is ${r.toFixed(2)}:1`);
    }
  });

  test(`${name}: each vehicle class colour reads on its own 14% tile`, () => {
    for (const k of ['bike', 'auto', 'car', 'comfort', 'suv']) {
      const fg = c(`class-${k}`);
      const tile = over([fg[0], fg[1], fg[2], 0.14], c('bg-100'));
      const r = ratio(fg, tile);
      assert.ok(r >= 4.5, `${name}: class ${k} on its tile is ${r.toFixed(2)}:1`);
      assert.ok(ratio(c('ink'), tile) >= 4.5, `${name}: ink on the ${k} tile`);
    }
    assert.ok(ratio(c('class-premium'), c('class-premium-bg')) >= 4.5, `${name}: premium`);
  });
}

test('the old slate greys are gone from the public palette', () => {
  const SLATE = ['#f1f5f9', '#94a3b8', '#8090a6', '#64748b', '#475569', '#e2e8f0', '#f8fafc', '#5b6577', '#7d8ba1', '#eebd2b'];
  for (const [name, t] of Object.entries(THEMES)) {
    for (const [k, v] of Object.entries(t)) {
      assert.ok(!SLATE.includes(v.toLowerCase()), `${name}: --${k} is still the slate ${v}`);
    }
  }
});
