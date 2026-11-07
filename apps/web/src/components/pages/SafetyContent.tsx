'use client';

import Link from 'next/link';
import { TripMiniMap } from '@/components/art/MiniMaps';
import { CallIcon, KeyLockIcon, ShieldCheckIcon } from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';

/**
 * /safety (approved design, 2026-11-07; Safety.html): the four things built
 * into every trip, then what to do in an emergency. No country's emergency
 * number: the visitor is told to call their local one first.
 */
export function SafetyContent() {
  const s = useSite().safety;

  const art = [
    <div key="code" className="s-scard__art s-scard__art--noir"><KeyLockIcon /></div>,
    <div key="live" className="s-scard__art s-scard__art--map">
      <TripMiniMap />
    </div>,
    <div key="sos" className="s-scard__art s-scard__art--red"><span>{s.sos}</span></div>,
    <div key="check" className="s-scard__art s-scard__art--green"><ShieldCheckIcon />{s.checked}</div>,
  ];

  return (
    <section className="s-wrap s-page s-cb">
      <div className="s-headrow">
        <div>
          <h1 className="t-heading">{s.title}</h1>
          <p className="s-lead">{s.lead}</p>
        </div>
      </div>

      <div className="s-cards4">
        {s.cards.map((c, i) => (
          <div key={c.title} className="s-scard">
            {art[i]}
            <b className="t-title">{c.title}</b>
            <span>{c.body}</span>
          </div>
        ))}
      </div>

      <div className="s-emergency">
        <span className="s-emergency__icon"><CallIcon /></span>
        <span className="s-emergency__text">
          <b className="t-title">{s.emergencyTitle}</b>
          <span>{s.emergencyBody}</span>
        </span>
        <Link href="/contact" className="s-btn s-btn--ghost-dark">{s.report}</Link>
      </div>
    </section>
  );
}
