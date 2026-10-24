import Image from 'next/image';

/**
 * A slot for a licensed photograph that does not exist yet.
 *
 * The implementation contract calls for genuine, approved photography of
 * Indian urban mobility in the hero and the driver section, and bars the
 * four ways of faking it: AI-generated imagery, car illustrations, generic
 * dashboards, and an interactive map standing in for a photo.
 *
 * None of the supplied assets contain a photograph. The design handoff ships
 * logos and app icons only; `SaaradhiGo_Final_Public_Homepage_Design_v1.pdf`
 * is a vector mockup with zero embedded images; the repository has none.
 *
 * So this is the honest third option: a correctly sized, correctly cropped
 * slot that says what belongs in it. It occupies the exact box the
 * photograph will occupy, so dropping the image in changes no layout -- and
 * it is obviously unfinished, which a decorative stand-in would not be.
 * Anyone looking at the page can see what is missing rather than being
 * shown something invented.
 *
 * To finish: put the file in `public/photography/`, then pass `src` and
 * `alt` instead of leaving this empty.
 */
export function ImageSlot({
  src,
  alt,
  needs,
  className = '',
}: {
  /** The licensed photograph, once there is one. */
  src?: string | null;
  /** Required whenever `src` is set: what the photograph shows. */
  alt?: string;
  /** What this slot is waiting for, shown while it is empty. */
  needs: string;
  className?: string;
}) {
  if (src) {
    // `fill` because the slot's box is set by its container's aspect-ratio;
    // `sizes` so the browser fetches the right width rather than the
    // desktop original on a phone.
    return (
      <Image
        className={className}
        src={src}
        alt={alt ?? ''}
        fill
        sizes="(max-width: 1024px) 100vw, 55vw"
        style={{ objectFit: 'cover' }}
      />
    );
  }

  return (
    <div className={`hp-slot ${className}`.trim()} role="note">
      <strong>Photography pending</strong>
      <span>{needs}</span>
    </div>
  );
}
