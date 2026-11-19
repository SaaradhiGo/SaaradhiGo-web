'use client';

import { useLegal } from '@/components/sg/LegalProvider';
import { Device } from '@/components/ui';
import { useSite } from '@/i18n/site';

/**
 * /about (approved design, 2026-11-07; About.html): what "Saaradhi" means and why the
 * company exists, the product itself, then three promises.
 * No founder name, no quotes.
 */
export function AboutContent() {
  const a = useSite().about;
  const us = useLegal().market === 'US';

  return (
    <section className="s-wrap s-page s-cb">
      {/* 18 Nov close-out (owner): the heading first, then a real product picture: the rider
          app on the real Hyderabad map (Boise for the US), captured on QA. No stock photos. */}
      <div className="s-about s-about--shot">
        <div className="s-about__text">
          <div className="t-label">{a.label}</div>
          <h1 className="t-heading">{a.title}</h1>
          <p>{a.body}</p>
        </div>
        <div className="s-about__shot">
          <Device src={us ? '/product/about-rider-app-us.webp' : '/product/about-rider-app.webp'}
            alt={us ? a.pictureAltUs : a.pictureAlt} />
        </div>
        <div className="s-cards3 s-about__cards">
          {a.cards.map((c) => (
            <div key={c.title} className="s-card">
              <b className="t-title">{c.title}</b>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
