import type { ReactNode } from 'react';

/**
 * The floating card: a booking panel, a choose-a-ride panel, a live-trip
 * panel. `glass` makes it the translucent `bg-glass` version that sits over
 * the map; without it the panel is solid `bg-100`, which is what it needs to
 * be when there is no map behind it.
 *
 * The 56px gold bar centred on the top edge is the panel's own detail, from
 * `.sg-panel::before`. It is a hairline, not an ornament: the design system
 * allows no glows here and no gradients anywhere outside the map scrims.
 */
export function GlassPanel({
  title,
  action,
  note,
  glass = true,
  className = '',
  children,
}: {
  /** Rendered in Cormorant, as the panel's heading. Omit for an untitled panel. */
  title?: ReactNode;
  /** A link or secondary control on the title row, e.g. "Edit trip". */
  action?: ReactNode;
  /** The small centred line under the content, e.g. the sign-in warning. */
  note?: ReactNode;
  glass?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`sg-panel ${glass ? 'sg-glass' : ''} ${className}`.trim()}>
      {title !== undefined
        && (action ? (
          <div className="flex items-center justify-between gap-sg-4">
            <h2 className="sg-panel__title">{title}</h2>
            {action}
          </div>
        ) : (
          <h2 className="sg-panel__title">{title}</h2>
        ))}
      {children}
      {note !== undefined && <p className="sg-panel__note">{note}</p>}
    </div>
  );
}
