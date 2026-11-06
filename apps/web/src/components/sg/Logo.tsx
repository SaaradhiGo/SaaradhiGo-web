import Link from 'next/link';

/**
 * The SaaradhiGo mark.
 *
 * The owner's logo and its family: the `lockup` (the full logo: charioteer,
 * road-sail, pin and ring, with the lettering) for the hero, footer, sign-in
 * and print; the `badge` (ring, road-sail and pin only; DRAFT, to be redrawn
 * by the illustrator) for headers and anything 48px or smaller, and
 * `badge-full` for 96px and up; the `wordmark` lettering alone.
 *
 * It is rendered as a CSS mask over the `logo` token, which is how the
 * handoff ships it. That is what makes it the right colour in both themes
 * without two files: gold on dark, dark gold on ivory, and always `gold-500`
 * inside the nav, an app icon or any `sg-on-noir` surface. The artwork is
 * never redrawn, rearranged, bevelled, gradiented or glowed.
 */
export function Logo({
  variant = 'badge',
  width,
  className = '',
  label,
}: {
  variant?: 'badge' | 'badge-full' | 'wordmark' | 'lockup';
  /** CSS width. The height follows the artwork's own aspect ratio. */
  width?: number | string;
  className?: string;
  /**
   * An accessible name, when this mark IS the content. Left off, the mark is
   * decorative -- which is right next to the words "Saaradhi Go", where a
   * label would make a screen reader say the name twice.
   */
  label?: string;
}) {
  return (
    <span
      className={`sg-logo sg-logo--${variant} ${className}`}
      style={width === undefined ? undefined : { width }}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': 'true' as const })}
    />
  );
}

/**
 * The nav lockup: the badge at 48px followed by "Saaradhi Go" in Cinzel 600.
 */
export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link className="sg-wordmark" href={href}>
      <Logo variant="badge" />
      Saaradhi Go
    </Link>
  );
}
