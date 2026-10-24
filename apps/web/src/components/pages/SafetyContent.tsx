'use client';

import Link from 'next/link';
import { Blocks, Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { useT } from '@/i18n/LocaleProvider';

/**
 * /safety -- the three safety features that exist, and an explicit list of
 * the ones that do not.
 *
 * EVERY CLAIM WAS CHECKED IN THE BACKEND BEFORE IT WAS WRITTEN. The PIN is
 * compared server-side in the trip consumer, so "verified on our servers" is
 * literal; the driver's coordinates are broadcast over the trip socket; an
 * alert raised during a ride is dispatched to the operations console with
 * the trip attached.
 *
 * The last block is the important one. A safety page that implies a staffed
 * emergency desk, insurance cover or an emergency-services partnership when
 * none exists is the single most harmful thing this site could say, so it
 * says the opposite, plainly, and points to real emergency services first.
 */
export function SafetyContent() {
  const p = usePages().safety;
  const t = useT();
  const blocks = p.sections.slice(0, -1);
  const caveat = p.sections[p.sections.length - 1];

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <Blocks blocks={blocks} />

        <div className="hp-caveat">
          <h2>{caveat.h}</h2>
          <p>{caveat.p}</p>
        </div>

        <div className="hp-actions">
          <Link href="/contact" className="sg-link">
            {t.closing.support}
          </Link>
        </div>
      </section>
    </>
  );
}
