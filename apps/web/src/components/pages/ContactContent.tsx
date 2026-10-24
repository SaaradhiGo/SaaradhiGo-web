'use client';

import Link from 'next/link';
import { Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

/**
 * /contact -- the routes that reach a person, in the visitor's language.
 *
 * STILL NO CONTACT FORM, ON PURPOSE. A form needs an endpoint that accepts
 * writes from anyone on the internet. The backend's support tickets require
 * an authenticated account (`/support/tickets/create/`), which is right: a
 * ticket belongs to a person and a trip. An unauthenticated one would mean a
 * new public write path, spam handling and its own rate limiting -- real
 * work to decide deliberately, not smuggle in behind a button.
 *
 * So a signed-in rider raises a ticket from their account, which lands in
 * the queue the team works, and everyone else emails the address in
 * `@/lib/support` -- whose deliverability is an open owner action, recorded
 * there.
 */
export function ContactContent() {
  const p = usePages().contact;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <div className="hp-block">
          <h2>{p.emailHeading}</h2>
          <div>
            <p>{p.emailBody}</p>
            <div className="hp-actions">
              <a className="sg-btn sg-btn--primary sg-btn--lg" href={SUPPORT_MAILTO}>
                {SUPPORT_EMAIL}
              </a>
            </div>
            <p className="hp-hint">{p.emailHint}</p>
          </div>
        </div>

        <ul className="hp-topics">
          {p.routes.map((r) => (
            <li className="hp-topic" key={r.h}>
              <h2>{r.h}</h2>
              <p>{r.p}</p>
            </li>
          ))}
        </ul>

        <div className="hp-caveat">
          <h2>{p.operatorHeading}</h2>
          <p>{p.operatorBody}</p>
          <div className="hp-actions">
            <Link href="/login" className="sg-link">
              {p.operatorCta}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
