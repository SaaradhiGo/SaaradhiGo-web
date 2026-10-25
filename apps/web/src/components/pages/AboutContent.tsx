'use client';

import { ButtonLink } from '@/components/sg/Button';
import { Photo } from '@/components/home/Photo';
import { Blocks, Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';

/**
 * /about -- why the service is built the way it is.
 *
 * NO FABRICATED COMPANY FACTS. No founding date, no headcount, no funding,
 * no trip counts, no investor logos, no leadership photographs, no
 * testimonials. None of that is known to this codebase, and a public page is
 * not the place to estimate it. What the page has instead is the product
 * reasoning, which is true and is checkable against the product itself --
 * including a closing section that says plainly how early the company is.
 */
export function AboutContent() {
  const p = usePages().about;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section--tight">
        <div className="hp-band hp-band--tall">
          <Photo src="/photography/about-city.jpg" alt={p.photoAlt ?? ''} sizes="100vw" />
        </div>
      </section>

      <section className="hp hp-section--tight">
        <Blocks blocks={p.sections} />
        {p.cta && (
          <div className="hp-actions">
            <ButtonLink href="/book" variant="primary" size="lg">
              {p.cta}
            </ButtonLink>
          </div>
        )}
      </section>
    </>
  );
}
