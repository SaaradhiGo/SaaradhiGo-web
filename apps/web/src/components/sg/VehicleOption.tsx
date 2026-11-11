'use client';

import type { ReactNode } from 'react';
import { Badge } from './Badge';
import { vehicleGlyphFor } from './icons';

/**
 * A selectable row for one vehicle class: glyph, name, a meta line, and the
 * up-front fare.
 *
 * Selected is a `gold-500` border on `gold-soft`, and exactly one row in the
 * list is `aria-pressed="true"`. The rows are ordered cheapest first, which
 * the list helper enforces rather than leaving to the caller.
 *
 * WHAT THIS WILL NOT DO. If the server could not price a category, the fare
 * slot says so in words and the row is not selectable. It does not show a
 * dash that reads as free, an average of the others, or last week's number.
 * A fare-lock promise starts with never showing a fare we cannot honour.
 */
export function VehicleOption({
  category,
  name,
  meta,
  fare,
  was,
  badge,
  selected,
  onSelect,
}: {
  /** The server's category code; picks the glyph. */
  category: string;
  name: string;
  /** "5 min away · 4 seats". Null when neither is known yet. */
  meta?: ReactNode;
  /** The formatted price, or null when this category could not be priced. */
  fare: string | null;
  /** A struck-through previous price, when there is a real one. */
  was?: string | null;
  badge?: { tone: 'gold' | 'premium'; text: string } | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const Glyph = vehicleGlyphFor(category);
  const priced = fare !== null;

  return (
    <button
      type="button"
      className="sg-vehicle"
      aria-pressed={selected}
      onClick={onSelect}
      disabled={!priced}
    >
      <span className="sg-vehicle__glyph">
        <Glyph />
      </span>
      <span>
        <span className="sg-vehicle__name">
          {name}
          {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
        </span>
        {meta && <span className="sg-vehicle__meta">{meta}</span>}
      </span>
      <span className="sg-vehicle__fare">
        {priced ? (
          <>
            {fare}
            {was && <span className="sg-vehicle__was">{was}</span>}
          </>
        ) : (
          // Not a dash and not a zero: the words say what happened.
          <span className="sg-vehicle__meta">Fare unavailable</span>
        )}
      </span>
    </button>
  );
}

export function VehicleList({ children }: { children: ReactNode }) {
  return <div className="sg-vehicles">{children}</div>;
}
