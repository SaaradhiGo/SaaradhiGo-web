import Link from 'next/link';

/**
 * The SaaradhiGo mark.
 *
 * Three forms, as the design system defines them: the `emblem` (the
 * charioteer in the ring), the `wordmark` ("SAARADHI GO" in classical
 * capitals) and the `lockup` (both, stacked) for splash screens and print.
 *
 * It is rendered as a CSS mask over the `logo` token, which is how the
 * handoff ships it. That is what makes it the right colour in both themes
 * without two files: gold on dark, dark gold on ivory, and always `gold-500`
 * inside the nav, an app icon or any `sg-on-noir` surface. The artwork is
 * never redrawn, rearranged, bevelled, gradiented or glowed.
 */
export function Logo({
  variant = 'emblem',
  width,
  className = '',
  label,
}: {
  variant?: 'emblem' | 'wordmark' | 'lockup';
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
 * The nav lockup: the emblem at 50px followed by "Saaradhi Go" in Cinzel.
 *
 * The emblem's minimum size is 40px, below which the carriage detail closes
 * up, so this is not a component to shrink -- on a phone the design keeps the
 * wordmark and drops the links instead.
 */
export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link className="sg-wordmark" href={href}>
      <Logo variant="emblem" />
      Saaradhi Go
    </Link>
  );
}
