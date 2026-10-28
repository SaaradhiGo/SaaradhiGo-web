import type { ReactNode } from 'react';

/**
 * The phone layout's sheet: the map on top, this pinned to the bottom.
 *
 * It is one component for both breakpoints on purpose. Under 768px the
 * stylesheet fixes it to the bottom of the viewport with the grab handle, a
 * 72vh ceiling and its own scroll; at 768px and up the same markup becomes an
 * ordinary block in the flow, because on a desktop the panel floats over the
 * map instead. Nothing here branches on a width in JavaScript, so there is no
 * layout to get wrong between the server render and the client's.
 *
 * THE PRIMARY ACTION IS PINNED TO THE FOOT OF THE SHEET. Pass it as
 * `primary` and it sticks to the bottom edge while the content above it
 * scrolls, which is what puts it where a thumb is. Passing it inside
 * `children` instead would let it scroll out of reach on a small screen --
 * the one place where the button that books the ride must never be.
 *
 * It respects `env(safe-area-inset-bottom)`, so on a phone with a home
 * indicator the button is above it rather than under it.
 */
export function BottomSheet({
  children,
  primary,
  className = '',
}: {
  children: ReactNode;
  /** The single primary action, pinned to the sheet's bottom edge. */
  primary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sg-sheet sg-bottomsheet ${className}`.trim()}>
      <div className="sg-bottomsheet__stack">{children}</div>
      {primary && <div className="sg-bottomsheet__primary">{primary}</div>}
    </div>
  );
}
