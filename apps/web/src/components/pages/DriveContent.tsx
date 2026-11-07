'use client';

import { ButtonLink } from '@/components/sg/Button';
import { Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { Card, Check, Clock } from '@/components/sg/icons';

/**
 * /drive -- three things the driver app does today, what an application
 * needs, and the button. Fits one screen at 1366x768 (owner, 2026-11-06).
 *
 * EACH CARD IS TRUE OF THE PRODUCT TODAY: every offer carries its fare; the
 * earnings screen lists each trip's fare, commission and net; and a driver
 * withdraws earnings to the UPI or bank details on file
 * (/driver/withdrawals/request/). The requirements are the documents the
 * onboarding flow asks for.
 */
const ICONS = [Clock, Check, Card];

export function DriveContent() {
  const p = usePages().drive;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <ul className="hp-cards">
          {p.sections.map((s, i) => {
            const Icon = ICONS[i] ?? Check;
            return (
              <li className="hp-card" key={s.h}>
                <span className="hp-card__icon" aria-hidden="true"><Icon /></span>
                <h2>{s.h}</h2>
                <p>{s.p}</p>
              </li>
            );
          })}
        </ul>

        <div className="hp-need">
          <h2 id="drive-needs" className="hp-panel__title">{p.needHeading}</h2>
          <ul className="hp-check" aria-labelledby="drive-needs">
            {p.needs.map((n) => (
              <li key={n}><Check />{n}</li>
            ))}
          </ul>
        </div>

        <div className="hp-actions">
          <ButtonLink href="/driver/sign-up" variant="primary" size="lg">
            {p.cta}
          </ButtonLink>
          <ButtonLink href="/driver/sign-in" variant="ghost" size="lg">
            {p.cta2}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
