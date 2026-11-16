'use client';

import Link from 'next/link';
import { CardIcon, EyeIcon, ListIcon } from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';
import { ExampleLines, ExampleTag } from '@/components/sg/ExampleRequest';
import { useSession } from '@/lib/useSession';
import { sessionRoles } from '@/lib/publicAuth';
import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';

/**
 * /drive (approved design, 2026-11-07; Drive.html): what a driver sees
 * before accepting, what they need to apply, and the request card.
 *
 * 13 Nov (owner): the request shows example numbers that add up, marked "Example", from the
 * Hyderabad rate card (lib/exampleFare.ts), never grey bars. No photo spot and no design note
 * until a real driver is photographed with their consent: the card stands on a plain panel.
 * Signed in, the actions follow the account: a driver goes to the driver home (or switches),
 * nobody signed in sees "Start driving" and "Driver sign in".
 */
export function DriveContent() {
  const d = useSite().drive;
  const tr = useTr();
  const session = useSession();
  const [roles, setRoles] = useState<string[] | null>(null);
  useEffect(() => {
    if (session.status === 'in') sessionRoles().then((r) => setRoles(r?.roles ?? null));
  }, [session.status]);
  const drives = roles?.includes('driver');
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
          {drives ? (
            <Link href="/driver" className="s-btn s-btn--primary s-btn--lg">{tr('Driver home')}</Link>
          ) : (
            <>
              <Link href="/driver/sign-up" className="s-btn s-btn--primary s-btn--lg">{d.start}</Link>
              {session.status !== 'in' && (
                <Link href="/driver/sign-in" className="s-btn s-btn--outline s-btn--lg">{d.signIn}</Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className="s-request-wrap">
        <div className="s-request" aria-label={tr('Example ride request')} role="img">
          <div className="s-request__head">
            <div className="t-label">{d.requestLabel}</div>
            <ExampleTag />
          </div>
          <ExampleLines fare={d.fare} commission={d.commission} earn={d.earn} />
          <div className="s-request__accept">{d.accept}</div>
          <div className="s-request__note">{d.requestNote}</div>
        </div>
      </div>
    </section>
  );
}
