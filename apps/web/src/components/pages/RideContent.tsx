'use client';

import { ButtonLink } from '@/components/sg/Button';
import { Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';

/**
 * /ride -- what happens when a rider books, in the order it happens: five
 * numbered cards in one row on desktop, then "Book a ride". Fits one screen
 * at 1366x768 (owner, 2026-11-06).
 *
 * Every step here is a step the product actually performs: the service-area
 * check before pricing, the per-class fares, the six-digit PIN the driver
 * must enter, the live position on the map, and cash settlement.
 */
export function RideContent() {
  const p = usePages().ride;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <ol className="hp-cards hp-cards--5">
          {p.sections.map((s, i) => (
            <li className="hp-card" key={s.h}>
              <span className="hp-card__n">{String(i + 1).padStart(2, '0')}</span>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>
        <div className="hp-actions">
          <ButtonLink href="/book" variant="primary" size="lg">
            {p.cta}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
