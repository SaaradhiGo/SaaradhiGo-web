import type { ReactNode } from 'react';

export type BadgeTone = 'gold' | 'premium' | 'success' | 'danger' | 'neutral';

/**
 * A short uppercase status or tag.
 *
 * ALWAYS A WORD. The tone supports the meaning and never carries it alone --
 * "Cancelled" in `danger`, not a red dot; "On the way" in `success`, not a
 * green one. A rider who cannot distinguish the two colours must still be
 * able to read what happened to their ride, and so must anyone looking at a
 * screenshot in a support ticket.
 *
 * `gold` is offers and recommendations ("Best value"); `premium` is the
 * Saaradhi Black tier and nothing else; `success` / `danger` are trip states;
 * `neutral` is everything else ("Scheduled", "Cash").
 */
export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: BadgeTone;
  /** One to three words. Never an icon on its own, never a bare colour. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`sg-badge sg-badge--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
