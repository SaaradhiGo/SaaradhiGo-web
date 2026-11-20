'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { companyRows } from './CompanyBlock';
import { useTr } from '@/i18n/website';
import { Alert, Card, CarGlyph, Shield, UserCheck } from '@/components/sg/icons';
import { usePages } from '@/i18n/usePages';
import { useLegal } from '@/components/sg/LegalProvider';
import { type StateRules, fetchStateRules } from '@/lib/legal';
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
  const { market, entity } = useLegal();
  // 14 Nov (USA): the agent for service of process in Idaho (Idaho Code 49-3705), once configured.
  const [rules, setRules] = useState<Record<string, StateRules>>({});
  useEffect(() => { if (market === 'US') void fetchStateRules().then(setRules); }, [market]);
  const agent = market === 'US' ? rules['US-ID']?.service_agent : undefined;

  const tr = useTr();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(SUPPORT_EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };
  const icons = [CarGlyph, Card, UserCheck, Shield];
  const emergency = market === 'US' ? '911' : '112';

  // 20 Nov (owner: "contact page is not coming properly"): one masthead band, the email as a
  // card you can read, copy or open, the four routes as a grid of cards, and who runs the service.
  return (
    <>
      <header className="lg-head">
        <div className="hp">
          <p className="lg-kicker">{tr('Support')}</p>
          <h1 className="lg-title">{p.title}</h1>
          <p className="lg-lead">{p.lead}</p>
        </div>
      </header>

      <section className="hp ct">
        <div className="ct-main">
          <div className="ct-email">
            <p className="ct-label">{p.emailHeading}</p>
            <p className="ct-email__body">{p.emailBody}</p>
            <p className="ct-email__addr">{SUPPORT_EMAIL}</p>
            <div className="ct-email__actions">
              <a className="sg-btn sg-btn--primary sg-btn--lg" href={SUPPORT_MAILTO}>{tr('Write to us')}</a>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--lg" onClick={copy} aria-live="polite">
                {copied ? tr('Copied') : tr('Copy address')}
              </button>
            </div>
            <p className="ct-email__hint">{p.emailHint}</p>
          </div>

          <div className="ct-urgent" role="note">
            <span className="ct-urgent__icon" aria-hidden="true"><Alert /></span>
            <div>
              <p className="ct-urgent__title">{tr('In danger right now? Call')} {emergency}.</p>
              <p className="ct-urgent__body">{tr('Call the emergency services first. Then press SOS in the app, so our team sees your trip and location.')}</p>
              <Link className="ct-urgent__link" href="/safety">{tr('How safety works')} →</Link>
            </div>
          </div>
        </div>

        <h2 className="ct-h2">{tr('Find the right route')}</h2>
        <ul className="ct-routes">
          {p.routes.map((r, i) => {
            const Icon = icons[i] ?? Shield;
            return (
              <li className="ct-route" key={r.h}>
                <span className="ct-route__icon" aria-hidden="true"><Icon /></span>
                <h3>{r.h}</h3>
                <p>{r.p}</p>
              </li>
            );
          })}
        </ul>

        <div className="ct-company">
          <div>
            <p className="ct-label">{tr('Who runs SaaradhiGo')}</p>
            <p className="ct-company__name">{entity.legal_name}</p>
            {companyRows(market, entity).map(([k, v]) => <p className="ct-company__line" key={k}>{k}: {v}</p>)}
            {market === 'US' ? (
              <p className="ct-company__line" data-testid="us-legal-contact">SaaradhiGo in the United States is operated by {entity.legal_name}.</p>
            ) : null}
            {agent?.name ? (
              <p className="ct-company__line" data-testid="idaho-agent">
                Agent for service of process in Idaho: {agent.name}
                {agent.address ? `, ${agent.address}` : ''}{agent.phone ? `, ${agent.phone}` : ''}.
              </p>
            ) : null}
          </div>
          <ul className="ct-company__links">
            <li><Link href="/help">{tr('Help centre')}</Link></li>
            <li><Link href="/safety">{tr('Safety')}</Link></li>
            {market === 'IN' ? <li><Link href="/grievance">{tr('Grievance officer')}</Link></li> : null}
            <li><Link href="/privacy">{tr('Privacy policy')}</Link></li>
          </ul>
        </div>
        {/* NO OPERATOR SIGN-IN HERE: the console is internal and is not sold to riders. */}
      </section>
    </>
  );
}
