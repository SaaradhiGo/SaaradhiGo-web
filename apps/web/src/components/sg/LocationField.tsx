'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { Locate } from './icons';

/**
 * Pickup and destination, joined by a dashed route rail.
 *
 * SHAPE, NOT JUST COLOUR. The pickup marker is a CIRCLE in `pickup` green and
 * the destination is a SQUARE in `gold-500`. That is the whole reason both
 * exist as separate modifiers: a rider who cannot tell green from gold must
 * still be able to see which end of the journey a row is, here and on the
 * map, where the same two shapes are used.
 *
 * The rail is drawn by `.sg-route::before`, so the two fields read as one
 * journey rather than two unrelated boxes. Placeholders are questions --
 * "Where are you?", "Where to?" -- and the labels are "Pickup" and
 * "Destination".
 */

export type MarkerKind = 'pickup' | 'drop';

/** The marker on its own, for recaps and timelines. */
export function RouteMarker({ kind }: { kind: MarkerKind }) {
  return (
    <span
      className={`sg-field__marker sg-field__marker--${kind}`}
      aria-hidden="true"
    />
  );
}

export function LocationField({
  id,
  kind,
  label,
  action,
  ...input
}: {
  id: string;
  kind: MarkerKind;
  label: string;
  /** An optional trailing icon button, e.g. "Use my current location". */
  action?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="sg-field" htmlFor={id}>
      <RouteMarker kind={kind} />
      <span className="sg-field__body">
        <span className="sg-field__label">{label}</span>
        <input id={id} {...input} />
      </span>
      {action}
    </label>
  );
}

/** The wrapper that draws the rail between the pair. */
export function RouteFields({ children }: { children: ReactNode }) {
  return <div className="sg-route">{children}</div>;
}

/**
 * "Use my current location".
 *
 * An icon-only control, so it carries its name in `aria-label` -- and keeps a
 * 48px hit area on a phone, which the stylesheet enforces rather than this
 * component hoping for it.
 */
export function LocateAction({
  onClick,
  busy = false,
}: {
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      className="sg-field__action"
      onClick={onClick}
      disabled={busy}
      aria-label={busy ? 'Finding your location' : 'Use my current location'}
    >
      <Locate />
    </button>
  );
}
