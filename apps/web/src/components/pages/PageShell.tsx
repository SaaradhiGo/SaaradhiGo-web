'use client';

/**
 * The masthead every interior public page opens with: one H1 and one lead
 * paragraph, nothing else.
 *
 * There is no decorative rule above the heading, no eyebrow label and no
 * italic flourish inside it. Six pages opening with the same ornament is
 * what makes a site feel generated rather than written, which is exactly the
 * note the owner gave on the first homepage.
 */
export function Masthead({ title, lead }: { title: string; lead: string }) {
  return (
    <section className="hp hp-masthead">
      <h1 className="hp-h1">{title}</h1>
      <p className="hp-lead">{lead}</p>
    </section>
  );
}

type Block = { h: string; p: string };

/**
 * A page's body sections. `numbered` is for a page that describes a sequence
 * -- booking a ride -- where the order is part of the meaning; everything
 * else is a plain stack, because numbering prose that is not a procedure
 * invents a structure the reader then tries to follow.
 */
export function Blocks({
  blocks,
  numbered,
}: {
  blocks: readonly Block[];
  numbered?: boolean;
}) {
  return (
    <ul className={`hp-blocks${numbered ? ' hp-blocks--numbered' : ''}`}>
      {blocks.map((b) => (
        <li className="hp-block" key={b.h}>
          <h2>{b.h}</h2>
          <p>{b.p}</p>
        </li>
      ))}
    </ul>
  );
}
