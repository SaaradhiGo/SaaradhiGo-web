import Image from 'next/image';

/**
 * A licensed photograph in a fixed-ratio slot.
 *
 * Every image on the public site comes from `public/photography/`, with its
 * licence, author and source recorded in `CREDITS.json` beside it. All three
 * are Creative Commons Attribution, which permits commercial use and REQUIRES
 * the credit rendered by `PhotoCredits` in the footer -- so removing that
 * component breaks the licence, not just the design.
 *
 * `fill` plus `sizes` lets Next emit the right width per breakpoint rather
 * than shipping a 1600px file to a phone.
 *
 * THERE IS NO FRAMING PROP ANY MORE. There was one, because the sources
 * were wide panoramas being squeezed into a 3:2 box and the crop had to be
 * nudged per page. Every master is now cropped to 3:2 in the asset pipeline
 * with the framing chosen once, so a second framing decision at render time
 * would only be a way to disagree with the first. Re-crop the master if a
 * photograph is framed wrongly; do not nudge it here.
 */
export function Photo({
  src,
  alt,
  sizes = '(max-width: 1024px) 100vw, 55vw',
  priority = false,
  className = '',
}: {
  src: string;
  /** What the photograph actually shows. Never decorative on this site. */
  alt: string;
  sizes?: string;
  /** True only for the homepage hero, which is the LCP element. */
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      className={className}
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      style={{ objectFit: 'cover' }}
    />
  );
}
