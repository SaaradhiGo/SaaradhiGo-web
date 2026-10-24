/**
 * The icon set, traced from the design handoff's previews.
 *
 * Every path here is copied from the `preview.html` files rather than drawn
 * fresh, so the line weight (1.75 for interface icons, 2 for emphasis), the
 * round caps and the 24-box geometry are the designers' and not mine. The
 * vehicle glyphs use a 32-box, as they do in the previews.
 *
 * All of them inherit `currentColor` and take their size from the `sg-`
 * component they sit in -- 18px inside a button, 20px in a row, 30px in a
 * vehicle glyph -- so none of them carries a colour or a size of its own.
 */

type IconProps = { className?: string };

/* --- interface ---------------------------------------------------------- */

export function ArrowRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Locate({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function Lock({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function Card({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </svg>
  );
}

export function Phone({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}

export function Share({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />
    </svg>
  );
}

export function Shield({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
      <path d="M12 8v5M12 16v.5" />
    </svg>
  );
}

export function Clock({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function Star({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
    </svg>
  );
}

export function Check({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

export function Sun({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </svg>
  );
}

export function Moon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export function Menu({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function Close({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/* --- vehicle glyphs, on the previews' 32-box ----------------------------- */

export function BikeGlyph({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="21" r="4" />
      <circle cx="25" cy="21" r="4" />
      <path d="M7 21l5-8h7l6 8M12 13l-2-3h-3M19 13l2-4h3" />
    </svg>
  );
}

export function AutoGlyph({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 22V13c0-3 2-5 5-5h9l5 7h3v7" />
      <path d="M14 8v7h10" />
      <circle cx="9" cy="23" r="2.5" />
      <circle cx="24" cy="23" r="2.5" />
    </svg>
  );
}

export function CarGlyph({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21v-4l3-6c.5-1 1.5-2 3-2h12c1.5 0 2.5 1 3 2l3 6v4z" />
      <path d="M7 15h18" />
      <circle cx="9.5" cy="21.5" r="2.5" />
      <circle cx="22.5" cy="21.5" r="2.5" />
    </svg>
  );
}

export function SuvGlyph({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 21v-7l3-6h17l4 6h2v7z" />
      <path d="M6 14h21M15 8v6" />
      <circle cx="9" cy="21.5" r="2.5" />
      <circle cx="23" cy="21.5" r="2.5" />
    </svg>
  );
}

/**
 * The glyph for a vehicle category, chosen from the category code the server
 * returned.
 *
 * The backend's `vehicle_types` are free-form codes, so this matches on
 * substrings and falls back to the saloon silhouette. An unrecognised
 * category gets a car, not a blank space: a missing icon beside a real fare
 * looks like a broken page.
 */
export function vehicleGlyphFor(category: string) {
  const c = category.toLowerCase();
  if (c.includes('bike') || c.includes('moto') || c.includes('two')) return BikeGlyph;
  if (c.includes('auto') || c.includes('rick') || c.includes('three')) return AutoGlyph;
  if (c.includes('suv') || c.includes('xl') || c.includes('van')) return SuvGlyph;
  return CarGlyph;
}
