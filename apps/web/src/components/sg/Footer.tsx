'use client';

import Link from 'next/link';
import { type Market } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { useSite } from '@/i18n/site';
import { copyrightLine, POLICY_PAGES as P } from '@/lib/legal';
import { useLegal } from './LegalProvider';

/**
 * The public footer (13 Nov, launch approvals; reworked 13 Nov, public-site UX): text and links
 * only, no dropdowns or buttons. Brand and tagline top-left, three columns of links (Product,
 * Resources, Company) aligned to the top, a rule, then the copyright row for the market chosen
 * in the header's globe panel or detected, and for India the registered office, CIN, phone and
 * email -- each only when it is configured.
 */
type Item = { label: string; href: string; only?: Market };
// 20 Nov (owner: "the footer looks like a shit"): riders, drivers, company and legal each get a
// column, the two journeys get a card each above them, and the base row carries the entity.
const COLUMNS: { title: string; items: Item[] }[] = [
  { title: 'Riders', items: [
    { label: 'How riding works', href: '/ride' }, { label: 'Fares', href: P.fares },
    { label: 'Safety', href: P.safety }, { label: 'Refunds and cancellations', href: P.refunds },
  ] },
  { title: 'Drivers', items: [
    { label: 'Drive with us', href: '/drive' }, { label: 'Apply to drive', href: '/driver/sign-up' },
    { label: 'Driver sign in', href: '/driver/sign-in' }, { label: 'Driver terms', href: P.driverTerms },
  ] },
  { title: 'Company', items: [
    { label: 'About', href: P.about }, { label: 'Help', href: '/help' }, { label: 'Contact', href: P.contact },
    { label: 'Grievance redressal', href: P.grievance, only: 'IN' },
  ] },
  { title: 'Legal', items: [
    { label: 'Rider terms', href: P.riderTerms }, { label: 'Privacy policy', href: P.privacy },
    { label: 'Cookie notice', href: P.cookies }, { label: 'Text messages', href: P.textMessages },
    // 14 Nov (USA): Idaho's policy pages (Idaho Code 49-3709, 49-3713).
    { label: 'Zero tolerance', href: P.zeroTolerance, only: 'US' },
    { label: 'Accessibility', href: P.accessibility, only: 'US' },
    { label: 'Delete your account', href: P.deleteAccount },
  ] },
];

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  );
}

export function Footer() {
  const tr = useTr();
  const s = useSite();
  const { market, entity } = useLegal();

  const details = (market === 'IN'
    ? [entity.registered_address && `${tr('Registered office')}: ${entity.registered_address}`,
       entity.cin && `CIN ${entity.cin}`,
       entity.support_phone, entity.support_email]
    : [entity.registered_address,
       entity.state_of_formation && entity.file_number
         && `${entity.state_of_formation} ${tr('file number')} ${entity.file_number}`,
       entity.support_phone, entity.support_email]).filter(Boolean);

  return (
    <footer className="s-footer s-cb">
      <div className="s-wrap s-footer__cta">
        <Link className="s-footer__card" href="/ride">
          <span className="s-footer__cardk">{tr('Riders')}</span>
          <span className="s-footer__cardh">{tr('See your fare before you book')}</span>
          <span className="s-footer__cardgo">{tr('How riding works')} <Arrow /></span>
        </Link>
        <Link className="s-footer__card" href="/driver/sign-up">
          <span className="s-footer__cardk">{tr('Drivers')}</span>
          <span className="s-footer__cardh">{tr('Your earning shown on every request')}</span>
          <span className="s-footer__cardgo">{tr('Apply to drive')} <Arrow /></span>
        </Link>
      </div>

      <div className="s-wrap s-footer__top">
        <div className="s-footer__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="s-footer__logo" src="/brand/wordmark-gold.svg" alt="SaaradhiGo" width={180} height={32} />
          <span className="s-footer__line">{s.footer.line}</span>
          {market === 'IN' && <span className="s-footer__city"><span className="s-footer__dot" aria-hidden="true" />{tr('Launching first in Hyderabad')}</span>}
        </div>
        <nav className="s-footer__cols" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div className="s-footer__col" key={col.title}>
              <h2 className="s-footer__colhead">{tr(col.title)}</h2>
              <ul>
                {col.items.filter((i) => !i.only || i.only === market).map((i) => (
                  <li key={i.href}><Link href={i.href}>{tr(i.label)}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="s-wrap">
        <div className="s-footer__base">
          <div className="s-footer__entity">
            <span data-testid="footer-operated-by">{copyrightLine(entity)}</span>
            {details.length > 0 && (
              <span className="s-footer__details" data-testid="footer-details">{details.join(' · ')}</span>
            )}
          </div>
          <span className="s-footer__quick">
            <Link href={P.privacy}>{tr('Privacy')}</Link>
            <Link href={P.riderTerms}>{tr('Terms')}</Link>
            <Link href={P.contact}>{tr('Contact')}</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

/** The one-line legal footer of the signed-in areas (rider, driver, console). */
export function LegalLine({ className = '' }: { className?: string }) {
  const { entity } = useLegal();
  return (
    <footer className={`sg-legal-line ${className}`.trim()} data-testid="legal-line">
      <span>{copyrightLine(entity)}</span>
      <span className="sg-legal-line__links">
        <Link href={P.riderTerms}>Terms</Link>
        <Link href={P.privacy}>Privacy</Link>
        <Link href={P.contact}>Contact</Link>
      </span>
    </footer>
  );
}
