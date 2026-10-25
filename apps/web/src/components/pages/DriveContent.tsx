'use client';

import { ButtonLink } from '@/components/sg/Button';
import { Photo } from '@/components/home/Photo';
import { Blocks, Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { useT } from '@/i18n/LocaleProvider';

/**
 * /drive -- the driver proposition and the application.
 *
 * WHAT THIS PAGE NO LONGER SAYS. An earlier version promised a per-trip
 * commission breakdown, daily earnings, and payouts to a registered bank
 * account. Those are product intentions, not shipped behaviour, so they are
 * gone; what remains is the fare shown on each offer before acceptance, the
 * online/offline choice, and the completed-trip record -- all of which the
 * driver app does today.
 *
 * The requirements list is the document set the onboarding flow actually
 * asks for.
 */
export function DriveContent() {
  const p = usePages().drive;
  const t = useT();

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <Blocks blocks={p.sections} />
        <div className="hp-actions">
          <ButtonLink href="/driver/sign-up" variant="primary" size="lg">
            {p.cta}
          </ButtonLink>
          <ButtonLink href="/driver/sign-in" variant="ghost" size="lg">
            {p.cta2}
          </ButtonLink>
        </div>
      </section>

      {/* THE PHOTOGRAPH IS A BAND, NOT A COLUMN.
          It used to sit beside the questions in a half-width box, which left
          a tall empty column above and below it and shrank an already-wide
          street scene to the size of a stamp. Full width, it is the vehicle
          at the size a driver page should show it, and the questions get the
          whole column underneath. */}
      <section className="hp hp-section--tight">
        <div className="hp-band hp-band--tall">
          <Photo
            src="/photography/drive-autos.jpg"
            alt={t.drive.photoAlt}
            sizes="100vw"
          />
        </div>
      </section>

      <section className="hp hp-section--tight">
        <dl className="hp-qa hp-qa--split">
          {p.faq.map((q) => (
            <div key={q.h}>
              <dt>{q.h}</dt>
              <dd>{q.p}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
