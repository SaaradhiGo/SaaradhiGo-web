'use client';

import { ButtonLink } from '@/components/sg/Button';
import { Photo } from '@/components/home/Photo';
import { Blocks, Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';

/**
 * /ride -- what happens when a rider books, in the order it happens.
 *
 * Every step here is a step the product actually performs: the service-area
 * check before pricing, the per-class fares from the pricing service, the
 * four-digit PIN the driver must enter, the live position on the map, and
 * cash settlement. Nothing about wallets, scheduled rides, fare splitting or
 * loyalty, none of which exist.
 */
export function RideContent() {
  const p = usePages().ride;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <Blocks blocks={p.sections} numbered />
        <div className="hp-actions">
          <ButtonLink href="/book" variant="primary" size="lg">
            {p.cta}
          </ButtonLink>
        </div>
      </section>

      <section className="hp hp-section">
        <div className="hp-band">
          <Photo
            src="/photography/ride-sedan.jpg"
            alt={p.photoAlt ?? ''}
            sizes="100vw"
          />
        </div>
      </section>
    </>
  );
}
