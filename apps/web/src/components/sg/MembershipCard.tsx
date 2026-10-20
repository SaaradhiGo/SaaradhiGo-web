import { Logo } from './Logo';

/**
 * The Saaradhi Black membership card.
 *
 * `noir` in both themes, with the emblem as a 10%-opacity watermark bleeding
 * off the top-right corner and a gold hairline at 45%. On the homepage the
 * band tilts it -6deg; on a phone the stylesheet straightens it, because a
 * rotated card at 390px loses its corners off the gutter.
 *
 * WHAT IS REAL AND WHAT IS NOT. There is no membership product in the
 * backend: no tier, no member number, no issue date, no enrolment endpoint.
 * So this component takes what it shows, and the homepage passes it the
 * unissued state -- the tier name, which is a brand fact, and nothing else.
 * It does not print a plausible member name over a card that cannot exist
 * yet; a specimen card that reads like a real one is a promise the product
 * has not made.
 */
export function MembershipCard({
  tier = 'Saaradhi Black',
  name,
  left,
  right,
  className = '',
}: {
  tier?: string;
  /** The member's name. Null until there is a membership to name. */
  name?: string | null;
  /** Bottom-left meta, e.g. a member number. Null when there is none. */
  left?: string | null;
  /** Bottom-right meta, e.g. "Member since 2026". Null when there is none. */
  right?: string | null;
  className?: string;
}) {
  return (
    <div className={`sg-member sg-on-noir ${className}`.trim()}>
      <Logo variant="emblem" className="wm" />
      <div className="flex items-center gap-sg-3">
        <Logo variant="emblem" width={44} />
        <span className="sg-member__tier">{tier.toUpperCase()}</span>
      </div>
      <div className="sg-member__name">
        {name ?? (
          /* TODO(membership): no membership product exists in the backend --
             there is no tier, member number or enrolment endpoint to read a
             name from. Replace this line with the member's name once
             `/membership/` lands. Until then the card shows what it is, not
             who holds it. */
          <span className="text-on-noir-muted">Not yet issued</span>
        )}
      </div>
      <div className="sg-member__meta">
        <span>{left ?? 'Invitation only'}</span>
        <span>{right ?? 'Hyderabad · Vijayawada'}</span>
      </div>
    </div>
  );
}
