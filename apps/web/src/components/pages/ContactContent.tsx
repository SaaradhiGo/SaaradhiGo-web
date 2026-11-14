'use client';

import { useEffect, useState } from 'react';
import { Masthead } from './PageShell';
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

        {market === 'US' && (
          <div className="hp-block" data-testid="us-legal-contact">
            <h2>{entity.legal_name}</h2>
            <div>
              <p>SaaradhiGo in the United States is operated by {entity.legal_name}.</p>
              {agent?.name ? (
                <p data-testid="idaho-agent">
                  Agent for service of process in Idaho: {agent.name}
                  {agent.address ? `, ${agent.address}` : ''}{agent.phone ? `, ${agent.phone}` : ''}.
                </p>
              ) : null}
            </div>
          </div>
        )}

        <ul className="hp-topics">
          {p.routes.map((r) => (
            <li className="hp-topic" key={r.h}>
              <h2>{r.h}</h2>
              <p>{r.p}</p>
            </li>
          ))}
        </ul>

        {/* NO OPERATOR SIGN-IN HERE.
            The console is internal. Promoting its entrance on the page a
            rider reaches when something has gone wrong with their trip
            advertises a door they cannot open, and puts staff navigation in
            front of customers. `/login` still exists and still works for the
            people who need it; it is simply not sold to riders. */}
      </section>
    </>
  );
}
