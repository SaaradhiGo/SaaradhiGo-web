'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/sg/Button';
import { HeroBooking } from '@/components/home/HeroBooking';
import { ImageSlot } from '@/components/home/ImageSlot';
import { RideCategories } from '@/components/home/RideCategories';
import { Lock, Phone, Shield } from '@/components/sg/icons';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The homepage, in the locked order: hero, ride categories, how it works,
 * drive, safety, apps, closing. The footer comes from the layout.
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
  const t = useT();

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
      {/* 1 — Hero ------------------------------------------------------- */}
      <section className="hp" aria-labelledby="hero-title">
        <div className="hp-hero">
          <div>
            <h1 id="hero-title" className="hp-hero__title">
              {t.hero.titleTop}
              <span>{t.hero.titleBottom}</span>
            </h1>
            <p className="hp-hero__sub">{t.hero.subtitle}</p>
            <HeroBooking />
          </div>

          <div className="hp-hero__media">
            <ImageSlot needs={t.hero.photoNeeds} pendingLabel={t.hero.photoPending} />
          </div>
        </div>
      </section>

      {/* 2 — Choose your ride -------------------------------------------- */}
      <RideCategories />

      {/* 3 — Getting there is simple ------------------------------------- */}
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

      {/* 4 — Drive with SaaradhiGo --------------------------------------- */}
      <section className="hp hp-section" id="drive" aria-labelledby="drive-h">
        <div className="hp-split">
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
          <div className="hp-split__media">
            <ImageSlot needs={t.drive.photoNeeds} pendingLabel={t.hero.photoPending} />
          </div>
        </div>
      </section>

      {/* 5 — Safety ------------------------------------------------------ */}
      <section className="hp hp-section" id="safety" aria-labelledby="safety-h">
        <h2 id="safety-h" className="hp-h2">
          {t.safety.heading}
        </h2>
        <p className="hp-lead">{t.safety.lead}</p>
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
      </section>

      {/* 6 — The apps ----------------------------------------------------
          NO QR CODES AND NO STORE LINKS. Neither app is published, so there
          is no listing a code could point at; a QR that resolves to nothing
          is worse than no QR. Both are marked "coming soon" and the section
          says what works in the browser today. */}
      <section className="hp hp-section" id="apps" aria-labelledby="apps-h">
        <h2 id="apps-h" className="hp-h2">
          {t.apps.heading}
        </h2>
        <p className="hp-lead">{t.apps.lead}</p>
        <div className="hp-apps">
          <div className="hp-app">
            <div>
              <h3>{t.apps.rider}</h3>
              <span>{t.apps.comingSoon}</span>
            </div>
          </div>
          <div className="hp-app">
            <div>
              <h3>{t.apps.driver}</h3>
              <span>{t.apps.comingSoon}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 7 — Closing ----------------------------------------------------- */}
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
