'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/sg/Button';
import { HeroBooking } from '@/components/home/HeroBooking';
import { HeroMap } from '@/components/home/HeroMap';
import { Logo } from '@/components/sg/Logo';
import { PromiseStrip } from '@/components/sg/PromiseStrip';
import { RideCategories } from '@/components/home/RideCategories';
import { HOME_COPY } from '@/i18n/home';
import { Lock, Phone, Shield } from '@/components/sg/icons';
import { useLocale } from '@/i18n/LocaleProvider';

/**
 * The homepage: hero, promises, ride classes, how it works, drive, safety
 * band, closing. The footer comes from the layout.
 *
 * "WHERE WE OPERATE" IS GONE, as instructed -- the section, its city chips,
 * its heading and its anchor. The dispatcher's service zones are untouched:
 * booking is still restricted by them, and `/book` still says "we do not
 * operate at that pickup point yet" when a point falls outside one. What was
 * removed is the marketing claim, not the restriction.
 *
 * Every visible string comes from the dictionary, so the page is fully
 * translated in all five locales. Nothing here is machine-translated at
 * runtime.
 */
export function HomeContent() {
  const { t, language } = useLocale();
  const h = HOME_COPY[language];

  const STEPS = [
    { n: '01', title: t.steps.s1t, body: t.steps.s1b },
    { n: '02', title: t.steps.s2t, body: t.steps.s2b },
    { n: '03', title: t.steps.s3t, body: t.steps.s3b },
  ];

  // Implemented and shipping. No response desk, no background-check
  // programme, no insurance, no ride recording -- none of which exist.
  const SAFETY = [
    { icon: Lock, title: t.safety.pinT, body: t.safety.pinB },
    { icon: Phone, title: t.safety.trackT, body: t.safety.trackB },
    { icon: Shield, title: t.safety.alertT, body: t.safety.alertB },
  ];

  return (
    <>
      {/* Hero: copy and the booking panel, and on tablet and desktop a real
          map of the city. The panel is where the destination suggestions drop
          down, so no ancestor may clip it. */}
      <section className="hp hp-hero-band" aria-labelledby="hero-title">
        <div className="hp-hero">
          {/* The owner's full logo leads the hero; the nav shows the badge only
              once this has scrolled away (2026-11-06). */}
          <Logo variant="lockup" className="hp-hero__logo" label="Saaradhi Go" />
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

      {/* 3 — Getting there is simple */}
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

      {/* 4 — Drive with SaaradhiGo */}
      <section className="hp hp-section" id="drive" aria-labelledby="drive-h">
        <div>
          <div>
            <h2 id="drive-h" className="hp-h2">
              {t.drive.heading}
            </h2>
            <p className="hp-lead">{t.drive.body}</p>
            <div className="mt-sg-6">
              {/* Driver onboarding is live: a working route backed by the
                  document-upload flow. */}
              <ButtonLink href="/driver/sign-up" variant="primary" size="lg">
                {t.drive.cta}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      {/* Noir band: pure black, gold hairlines, the emblem. Safety only; the
          features listed are the ones that ship. */}
      <section className="hp-band sg-on-noir" id="safety" aria-labelledby="safety-h">
        <div className="hp hp-band__in">
          <div>
            <span className="sg-eyebrow">{h.bandEyebrow}</span>
            <h2 id="safety-h" className="hp-h2">
              {h.bandHeading} <em>{h.bandHeadingEm}</em>
            </h2>
            <ul className="hp-facts">
              {SAFETY.map(({ icon: Icon, title, body }) => (
                <li key={title} className="hp-fact">
                  <span className="hp-fact__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Logo variant="badge-full" className="hp-band__emblem" />
        </div>
      </section>

      {/* 7 — Closing */}
      <section className="hp" aria-labelledby="closing">
        <div className="hp-closing">
          <h2 id="closing" className="hp-h2">
            {t.closing.heading}
          </h2>
          <p className="hp-lead">{t.closing.body}</p>
          <div className="hp-closing__actions">
            <ButtonLink href="/book" variant="primary" size="lg">
              {t.closing.cta}
            </ButtonLink>
            <Link href="/contact" className="sg-link self-center">
              {t.closing.support}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
