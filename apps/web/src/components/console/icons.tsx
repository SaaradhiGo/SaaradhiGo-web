/**
 * The console's icons.
 *
 * One set, one grid, one stroke weight. They are drawn on a 24 box at
 * 1.6 stroke with round caps and joins, which is what makes eight separate
 * glyphs read as one family rather than eight downloads.
 *
 * `currentColor` throughout, so a nav item's colour carries its icon
 * without a second rule — and nothing here is filled, because a filled
 * glyph beside a stroked one is the fastest way to make a set look
 * assembled rather than designed.
 */
type Props = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Dashboard: a dial, because the page is a read-out. */
export function Gauge({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="m12 14 4-4" />
      <circle cx="12" cy="14" r="1.4" />
    </svg>
  );
}

/** SOS: an alarm, and the only icon with motion in its shape. */
export function Siren({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M8 13a4 4 0 0 1 8 0v4H8z" />
      <path d="M6 20h12" />
      <path d="M12 5V3M5.6 7.6 4.2 6.2M18.4 7.6l1.4-1.4" />
    </svg>
  );
}

/** Trips: a route between two points. */
export function Route({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8 6h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h4" />
    </svg>
  );
}

/** Drivers: people. */
export function Users({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 13.4A5.5 5.5 0 0 1 20.5 19" />
    </svg>
  );
}

/** Support: a ring buoy. */
export function LifeBuoy({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="m6 6 3.6 3.6M18 6l-3.6 3.6M6 18l3.6-3.6M18 18l-3.6-3.6" />
    </svg>
  );
}

/** Withdrawals: money leaving. */
export function Wallet({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h11a2 2 0 0 1 2 2v1" />
      <path d="M3.5 8.5v8A2.5 2.5 0 0 0 6 19h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H6a2.5 2.5 0 0 1-2.5-2.5Z" />
      <circle cx="16.5" cy="14" r="1" />
    </svg>
  );
}

/** Zones and fares: an area on a map. */
export function MapPin({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </svg>
  );
}

/** Forward, for a row that is a link. */
export function Chevron({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

/** An outstanding item. Paired with the word, never alone. */
export function Alert({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 8.5v4.5" />
      <circle cx="12" cy="16.4" r=".9" fill="currentColor" stroke="none" />
      <path d="M10.3 3.9 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}
