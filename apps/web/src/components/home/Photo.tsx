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
 * `position` IS NOT DECORATION. Our photographs are wide -- the city road
 * shots are better than 2:1 -- and a slot that is nearer square crops the
 * sides hard. Centred, the Visakhapatnam hero kept the kerb and threw away
 * the skyline that makes it recognisable. Framing is how a wide photograph
 * survives a narrow box, and it is cheaper and more honest than re-cropping
 * the file, which would be an adaptation of a CC BY work.
 */
export function Photo({
  src,
  alt,
  sizes = '(max-width: 1024px) 100vw, 55vw',
  priority = false,
  position,
  className = '',
}: {
  src: string;
  /** What the photograph actually shows. Never decorative on this site. */
  alt: string;
  sizes?: string;
  /** True only for the homepage hero, which is the LCP element. */
  priority?: boolean;
  /** CSS `object-position`, to frame a wide photograph inside its slot. */
  position?: string;
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
      style={{ objectFit: 'cover', objectPosition: position }}
    />
  );
}
