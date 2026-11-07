'use client';

import { ButtonLink } from '@/components/sg/Button';
import { HeroBooking } from '@/components/home/HeroBooking';
import { HeroMap } from '@/components/home/HeroMap';
import { PromiseStrip } from '@/components/sg/PromiseStrip';
import { RideCategories } from '@/components/home/RideCategories';
import { HOME_COPY } from '@/i18n/home';
import { useLocale } from '@/i18n/LocaleProvider';

/**
 * The homepage (owner, 2026-11-06): the hero, the promises, the ways to
 * ride, one "How it works" row, and one closing band for drivers and
 * booking. The footer comes from the layout. The longer booking walk-through
 * lives on /ride and the safety detail on /safety, so neither repeats here.
 *
 * The hero's headline, lead and booking panel down to "See fares" fit the
 * first screen at 1366x768, 1440x900 and 390x844 (scripts/check-layout.mjs).
 * Every visible string comes from the dictionary.
 */
export function HomeContent() {
  const { t, language } = useLocale();
  const h = HOME_COPY[language];

  const STEPS = [
    { n: '01', title: t.steps.s1t, body: t.steps.s1b },
    { n: '02', title: t.steps.s2t, body: t.steps.s2b },
    { n: '03', title: t.steps.s3t, body: t.steps.s3b },
  ];

  return (
    <>
      {/* Hero: copy and the booking panel, and on tablet and desktop a real
          map of the city. The panel is where the destination suggestions drop
          down, so no ancestor may clip it. */}
      <section className="hp hp-hero-band" aria-labelledby="hero-title">
        <div className="hp-hero">
          <span className="sg-eyebrow">{h.eyebrow}</span>
          <h1 id="hero-title" className="hp-hero__title">
            {h.titleTop}
            <em>{h.titleBottom}</em>
          </h1>
          <p className="hp-hero__sub">{h.subtitle}</p>
          <div className="hp-panel">
            <h2 className="hp-panel__title">{h.panelTitle}</h2>
            <HeroBooking />
          </div>
        </div>
        <HeroMap />
      </section>

      <PromiseStrip />

      <RideCategories />

      <section className="hp hp-section" id="how-it-works" aria-labelledby="how">
        <h2 id="how" className="hp-h2">
          {t.steps.heading}
        </h2>
        <ol className="hp-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="hp-step">
              <div className="hp-step__n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* One closing band: drive with us, and book. The apps join it with
          store links once they are published; until then there is no
          "coming soon" placeholder (owner, 2026-11-06). */}
      <section className="hp hp-section" aria-label={t.drive.heading}>
        <div className="hp-cta">
          <div>
            <h2 className="hp-h2">{t.drive.heading}</h2>
            <p className="hp-lead">{t.drive.body}</p>
            <div className="hp-actions">
              <ButtonLink href="/driver/sign-up" variant="primary" size="lg">
                {t.drive.cta}
              </ButtonLink>
            </div>
          </div>
          <div>
            <h2 className="hp-h2">{t.closing.heading}</h2>
            <p className="hp-lead">{t.apps.lead}</p>
            <div className="hp-actions">
              <ButtonLink href="/book" variant="secondary" size="lg">
                {t.closing.cta}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
