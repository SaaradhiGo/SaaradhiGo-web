'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SearchIcon } from '@/components/sg/SiteIcons';
import { SITE, useSite } from '@/i18n/site';
import { useLegal } from '@/components/sg/LegalProvider';
import { POLICY_PAGES } from '@/lib/legal';

/**
 * /help (approved design, 2026-11-07; Help.html): a search that filters the
 * questions as you type, four topics, the top questions in two columns, and
 * a way to reach a person. Answers are only what the product does today.
 */
export function HelpContent({ topic }: { topic?: 'driving' } = {}) {
  const h = useSite().help;
  const en = SITE.en.help;
  const { market } = useLegal();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  // The driver area's Support opens on the Driving topic (owner, 2026-11-08):
  // the questions whose English mentions driving or the driver.
  const inTopic = h.faqs.filter((_, i) => !topic || /driv/i.test(`${en.faqs[i].q} ${en.faqs[i].a}`));
  const faqs = needle
    ? inTopic.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(needle))
    : inTopic;

  return (
    <section className="s-wrap s-page s-cb">
      <div className="s-headrow">
        <div>
          <h1 className="t-heading">{h.title}</h1>
          <p className="s-lead" style={{ marginTop: 8 }}>{h.lead}</p>
        </div>
        <label className="s-search">
          <SearchIcon />
          <input
            type="search"
            aria-label={h.searchLabel}
            placeholder={h.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {/* 14 Nov (USA): reporting an impaired driver (Idaho Code 49-3709). */}
      {market === 'US' && !topic && (
        <div style={{ marginTop: 24, padding: 20, border: '1px solid var(--c-border)', borderRadius: 16, background: 'var(--c-surface)' }} data-testid="help-impairment">
          <h2 className="t-title">Report driver impairment</h2>
          <p style={{ marginTop: 8 }}>
            If your driver seemed affected by drugs or alcohol, open the trip in{' '}
            <Link href="/trips">Your trips</Link> and choose Report driver impairment. The driver is paused at once
            while we investigate. If you are in danger, call 911 first.{' '}
            <Link href={POLICY_PAGES.zeroTolerance}>Our zero tolerance policy</Link>.
          </p>
        </div>
      )}

      <div className="s-topics">
        {h.topics.map((t) => (
          <Link key={t.title} href={t.href} className="s-topic">
            <b>{t.title}</b>
            <span>{t.body}</span>
          </Link>
        ))}
      </div>

      <h2 id="faqs" className="t-title s-faqs-title">{h.faqTitle}</h2>
      <div className="s-faqs">
        {faqs.map((f) => (
          <details key={f.q} className="s-faq">
            <summary>
              {f.q} <span aria-hidden="true">+</span>
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
      {faqs.length === 0 && <p className="t-muted" role="status">{h.noMatch}</p>}

      <div className="s-contact">
        <span>
          <b className="t-title">{h.contactTitle}</b>
          <span>{h.contactBody}</span>
        </span>
        <Link href="/contact" className="s-btn s-btn--primary">{h.contactCta}</Link>
      </div>
    </section>
  );
}
