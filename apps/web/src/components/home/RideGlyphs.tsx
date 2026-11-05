import type { ReactElement } from 'react';
import type { RideKey } from '@/lib/vehicles';

/**
 * Four distinct side-on vehicle lines for the homepage cards: 36px, 1.75
 * stroke, round caps. The shared glyphs in `sg/icons` are 32px UI icons and
 * Mini and Sedan are the same drawing there, so these are separate.
 */
const common = {
  viewBox: '0 0 48 32',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

const GLYPHS: Record<RideKey, ReactElement> = {
  // Three-wheeler: canopy, single front wheel, open side.
  auto: (
    <svg {...common}>
      <path d="M9 22V10c0-2 1-3 3-3h15c3 0 5 2 6 5l3 8" />
      <path d="M12 13h14M20 7v6" />
      <path d="M33 20h6" />
      <circle cx="13" cy="24" r="3.5" />
      <circle cx="32" cy="24" r="3.5" />
      <path d="M16.5 24h12M35.5 24H40" />
    </svg>
  ),
  // Hatchback: short body, sloping rear hatch.
  mini: (
    <svg {...common}>
      <path d="M6 24v-5c0-1 .5-2 2-2.5l5-1.5 5-5c1-1 2-1.5 3.5-1.5H31c2 0 3 .5 4 2l3 6 4 1.5c1 .5 1.5 1.5 1.5 2.5v3.5" />
      <path d="M13 15.5h26M24 9v6.5" />
      <circle cx="14" cy="24.5" r="3.5" />
      <circle cx="35" cy="24.5" r="3.5" />
      <path d="M6 24h4.5M17.5 24h14M38.5 24H44" />
    </svg>
  ),
  // Sedan: long body with a separate boot.
  sedan: (
    <svg {...common}>
      <path d="M3 24v-4.5c0-1 .5-1.8 1.8-2.2L12 15.5l5-5.5c.8-.8 1.8-1.2 3-1.2h9c1.4 0 2.4.5 3.4 1.5l4.4 5 5 1.2c1.2.3 2 1.2 2 2.5V24" />
      <path d="M17 15.5h22M28 9v6.5" />
      <circle cx="12.5" cy="24.5" r="3.5" />
      <circle cx="36.5" cy="24.5" r="3.5" />
      <path d="M3 24h6M16 24h17M40 24h5" />
    </svg>
  ),
  // SUV: tall boxy body, roof rack, big wheels.
  suv: (
    <svg {...common}>
      <path d="M4 24V12.5c0-1.2.8-2 2-2h24c1.5 0 2.6.6 3.5 1.8l3.5 5.2 4 1.5c1.2.4 2 1.3 2 2.5V24" />
      <path d="M10 6.5h20M4 17h38M20 10.5V17M32 10.5V17" />
      <circle cx="13" cy="24.5" r="4" />
      <circle cx="35" cy="24.5" r="4" />
      <path d="M4 24h5M17 24h14M39 24h5" />
    </svg>
  ),
};

/** The glyph for a backend class code, or null for a class without one. */
export function rideGlyph(key: RideKey | null): ReactElement | null {
  return key ? GLYPHS[key] : null;
}
