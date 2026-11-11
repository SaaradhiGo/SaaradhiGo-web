'use client';

import { useSite } from '@/i18n/site';

/**
 * /about (approved design, 2026-11-07; About.html): the full logo on black,
 * what "Saaradhi" means and why the company exists, then three promises.
 * No founder name, no quotes.
 */
export function AboutContent() {
  const a = useSite().about;

  return (
    <section className="s-wrap s-page s-cb">
      <div className="s-about">
        <div className="s-about__logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lockup-gold.svg" alt={a.logoAlt} width={212} height={230} />
        </div>
        <div>
          <div className="t-label">{a.label}</div>
          <h1 className="t-heading">{a.title}</h1>
          <p>{a.body}</p>
        </div>
      </div>
      <div className="s-cards3">
        {a.cards.map((c) => (
          <div key={c.title} className="s-card">
            <b className="t-title">{c.title}</b>
            <p>{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
