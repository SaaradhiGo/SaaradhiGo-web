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

/* --- the shell's controls ----------------------------------------------
   Same grid, same stroke. Added with the noir shell: search, alerts, the
   theme switch, the collapse handle, filters, sorting and the sign-in
   steps. */

export function Search({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

export function Bell({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function Sun({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  );
}

export function Moon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function ChevronDown({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ChevronLeft({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

export function Close({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** The sidebar's collapse handle: a panel with its left rail. */
export function PanelLeft({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M9 5v14" />
    </svg>
  );
}

/** Filters. */
export function Sliders({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0" />
      <circle cx="15.5" cy="7" r="1.8" />
      <circle cx="8.5" cy="12" r="1.8" />
      <circle cx="17.5" cy="17" r="1.8" />
    </svg>
  );
}

/** A sortable column, pointing the way the sort goes. */
export function SortArrow({ className, dir }: Props & { dir: 'asc' | 'desc' | 'none' }) {
  return (
    <svg {...base} width={14} height={14} className={className}>
      {dir === 'none' ? (
        <path d="M8 10l4-4 4 4M8 14l4 4 4-4" />
      ) : dir === 'asc' ? (
        <path d="M12 19V5M6 11l6-6 6 6" />
      ) : (
        <path d="M12 5v14M6 13l6 6 6-6" />
      )}
    </svg>
  );
}

/** Safety & Risk. */
export function Shield({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 5 6v6c0 4.2 3 7.3 7 8.5 4-1.2 7-4.3 7-8.5V6z" />
      <path d="m9.2 12 2 2 3.8-4" />
    </svg>
  );
}

/** Settings. */
export function Cog({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </svg>
  );
}

/** Growth. */
export function TrendUp({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 17 10 11l4 4 6-7" />
      <path d="M15 8h5v5" />
    </svg>
  );
}

export function Lock({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function Mail({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  );
}

/** The emergency account. */
export function KeyRound({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="8.5" cy="14.5" r="4" />
      <path d="m11.5 11.5 8-8M16 7l2.5 2.5M18.5 4.5 21 7" />
    </svg>
  );
}

export function Clock({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function Check({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function ArrowRight({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function LogOut({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </svg>
  );
}

/** Copy to the clipboard: two sheets. */
export function Copy({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

/** Save a file: an arrow into a tray. */
export function Download({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </svg>
  );
}

/** Reveal a masked value: an eye. Paired with a label, never alone. */
export function Eye({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

/** Mask it again: the same eye, struck through. */
export function EyeOff({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 4l16 16" />
      <path d="M10.6 6.1A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.3 16.3 0 0 1-3.2 3.9" />
      <path d="M6.6 7.6A15 15 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4-.9" />
      <path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" />
    </svg>
  );
}
