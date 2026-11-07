'use client';

import { useState } from 'react';
import { ButtonLink } from '@/components/sg/Button';
import { Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { Search } from '@/components/sg/icons';

/**
 * /help -- a search box over the questions, the questions as a collapsed
 * accordion in two columns, and a contact card (owner, 2026-11-06). Fits one
 * screen at 1366x768 with every question closed.
 *
 * The search filters these questions in the page; there is no knowledge base
 * behind it, and when nothing matches it hands the visitor to /contact.
 */
export function HelpContent() {
  const p = usePages().help;
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase();
  const shown = needle
    ? p.faqs.filter((f) => `${f.h} ${f.p}`.toLocaleLowerCase().includes(needle))
    : p.faqs;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <label className="hp-search">
          <Search />
          <span className="sr-only">{p.searchLabel}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={p.searchPlaceholder}
          />
        </label>

        {shown.length ? (
          <ul className="hp-faqs">
            {shown.map((f) => (
              <li key={f.h}>
                <details className="hp-faq" open={needle ? true : undefined}>
                  <summary>{f.h}</summary>
                  <p>{f.p}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-faqs__none" role="status">{p.noMatch}</p>
        )}

        <div className="hp-card hp-help-contact">
          <div>
            <h2>{p.contactHeading}</h2>
            <p>{p.contactBody}</p>
          </div>
          <ButtonLink href="/contact" variant="secondary">
            {p.contactCta}
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
