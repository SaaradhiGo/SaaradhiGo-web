'use client';

import Link from 'next/link';
import { Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { useT } from '@/i18n/LocaleProvider';

/**
 * /help -- short answers grouped by the thing the visitor is doing.
 *
 * NOT A SEARCH BOX OVER AN EMPTY KNOWLEDGE BASE. There are five topics and
 * about fifteen answers; a search field over that is theatre, and a search
 * field over nothing is worse. When the answer is not here the page hands
 * the visitor to /contact, which explains the real routes to a person.
 */
export function HelpContent() {
  const p = usePages().help;
  const t = useT();

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <ul className="hp-topics">
          {p.groups.map((g) => (
            <li className="hp-topic" key={g.h}>
              <h2>{g.h}</h2>
              <ul>
                {g.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="hp-actions">
          <Link href="/contact" className="sg-link">
            {t.closing.support}
          </Link>
        </div>
      </section>
    </>
  );
}
