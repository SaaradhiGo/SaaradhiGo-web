import type { ReactNode } from 'react';

/**
 * A floating pill over the map: "Pickup · 4 min", "Jubilee Hills · ₹248".
 *
 * It is always `noir` with `on-noir` text and a gold hairline, in BOTH
 * themes, because it has to stay legible over whatever the map happens to be
 * showing underneath it -- an ivory pill on a light basemap would disappear.
 * The emphasised part goes in `<b>`, which the stylesheet colours
 * `gold-500`.
 *
 * Positioned as a percentage of the map surface so it stays put when the map
 * is resized. This is a LABEL, not a marker: it does not track a coordinate,
 * and it is `aria-hidden` because the same information is in the panel beside
 * the map, in text a screen reader can reach in reading order.
 */
export function MapLabel({
  left,
  top,
  children,
}: {
  /** CSS left, e.g. '58%'. */
  left: string;
  /** CSS top, e.g. '68%'. */
  top: string;
  children: ReactNode;
}) {
  return (
    <span className="sg-maplabel" style={{ left, top }} aria-hidden="true">
      {children}
    </span>
  );
}
