'use client';

import Link from 'next/link';
import { CardIcon, EyeIcon, ListIcon } from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';

/**
 * /drive (approved design, 2026-11-07; Drive.html): what a driver sees
 * before accepting, what they need to apply, and the request card beside a
 * photo spot. The request shows its fare, commission and earning as bars,
 * never numbers.
 *
 * PHOTO: a neutral placeholder of the design's size and radius until a real
 * driver is photographed with their consent. No stock faces, no generated
 * people (AUDIT TODO(photo)).
 */
export function DriveContent() {
  const d = useSite().drive;
  const icons = [<EyeIcon key="e" />, <ListIcon key="l" />, <CardIcon key="c" />];

  return (
    <section className="s-wrap s-page s-two s-two--center s-cb">
      <div>
        <div className="t-label">{d.label}</div>
        <h1 className="t-heading" style={{ marginTop: 8 }}>{d.title}</h1>
        <div className="s-features">
          {d.features.map((f, i) => (
            <div key={f.title} className="s-feature">
              <span className="s-tile s-tile--gold">{icons[i]}</span>
              <span>
                <b>{f.title}</b>
                <span>{f.body}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="s-needs">
          <b>{d.needTitle}</b>
          <ul className="s-needs__chips">
            {d.needs.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <p>{d.needNote}</p>
        </div>
        <div className="s-actions">
          <Link href="/driver/sign-up" className="s-btn s-btn--primary s-btn--lg">{d.start}</Link>
          <Link href="/driver/sign-in" className="s-btn s-btn--outline s-btn--lg">{d.signIn}</Link>
        </div>
      </div>

      <div className="s-photo-wrap">
        <div className="s-photo" role="img" aria-label="Photo placeholder">
          <span><b>{d.photoLabel.toUpperCase()}</b>{d.photoNote}</span>
        </div>
        <div className="s-request" aria-hidden="true">
          <div className="t-label">{d.requestLabel}</div>
          <div className="s-bars">
            <div className="s-bar"><span>{d.fare}</span><i style={{ width: 56 }} /></div>
            <div className="s-bar"><span>{d.commission}</span><i style={{ width: 36 }} /></div>
            <div className="s-bar s-bar--earn"><span>{d.earn}</span><i style={{ width: 48 }} /></div>
          </div>
          <div className="s-request__accept">{d.accept}</div>
          <div className="s-request__note">{d.requestNote}</div>
        </div>
      </div>
    </section>
  );
}
