import type { ReactNode } from 'react';

/**
 * Who is coming: driver, car, plate, and a call action.
 *
 * THE PLATE IS THE POINT. At the kerb, in the dark, the number plate is the
 * one thing that tells a rider this is their car, so it is set on
 * `champagne` in tabular figures and spaced as it is printed on the vehicle
 * itself ("TS 09 EX 4821"). Everything else on this card is context for it.
 *
 * EVERY FIELD IS OPTIONAL BECAUSE EVERY FIELD CAN BE ABSENT. The trip socket
 * sends what it has; this card renders what it was given and leaves out what
 * it was not. It does not fill a missing rating with 5.0, a missing car with
 * a generic sedan, or a missing photo with someone else's initials -- a rider
 * matching a stranger's car against invented details is worse off than one
 * who can see the field is blank.
 */
export function DriverCard({
  name,
  initials,
  rating,
  vehicle,
  plate,
  badge,
  action,
}: {
  name: string;
  /** Up to two letters, derived from the name the server sent. */
  initials?: string | null;
  /** Rendered to two decimals, with the star in `gold-text`. */
  rating?: string | null;
  /** "Make Model · Colour", exactly as the server has it. */
  vehicle?: string | null;
  plate?: string | null;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sg-driver">
      <div className="sg-driver__avatar" aria-hidden="true">
        {initials ?? ' '}
      </div>
      <div className="min-w-0">
        <div className="sg-driver__name">
          {name}
          {rating && (
            <span className="sg-driver__rating">
              <span aria-hidden="true">★</span> {rating}
            </span>
          )}
        </div>
        {vehicle && <div className="sg-driver__meta">{vehicle}</div>}
        {plate && (
          <div className="mt-sg-2">
            <span className="sg-plate">{plate}</span>
          </div>
        )}
        {badge && <div className="mt-sg-2">{badge}</div>}
      </div>
      {action ?? <span />}
    </div>
  );
}

/**
 * Two letters from a name, for the avatar.
 *
 * Returns null for anything it cannot read, so the avatar stays blank rather
 * than showing a punctuation mark or the first letters of "Your driver".
 */
export function initialsFor(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => /\p{L}/u.test(p));
  if (parts.length === 0) return null;
  const letters = (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ''))
    .toUpperCase();
  return letters || null;
}
