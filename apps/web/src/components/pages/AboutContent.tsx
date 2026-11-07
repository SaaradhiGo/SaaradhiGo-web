'use client';

import { Logo } from '@/components/sg/Logo';
import { usePages } from '@/i18n/usePages';

/**
 * /about -- the full logo (at most 220px tall), two short paragraphs and the
 * three promises. Fits one screen at 1366x768 (owner, 2026-11-06).
 *
 * NO FABRICATED COMPANY FACTS. No founding date, headcount, funding, trip
 * counts, investor logos or testimonials. The second paragraph says plainly
 * how early the company is.
 */
export function AboutContent() {
  const p = usePages().about;
  const promises = p.sections.slice(0, 3);
  const where = p.sections[3];

  return (
    <>
      <section className="hp hp-about">
        <Logo variant="lockup" className="hp-about__logo" label="Saaradhi Go" />
        <div>
          <h1 className="hp-h1">{p.title}</h1>
          <p className="hp-lead">{p.lead}</p>
          {where && <p>{where.p}</p>}
        </div>
      </section>

      <section className="hp hp-section">
        <ul className="hp-cards">
          {promises.map((s) => (
            <li className="hp-card" key={s.h}>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
