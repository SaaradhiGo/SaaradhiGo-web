'use client';

import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { MARKET_INFO, MARKETS, type Market } from '@/i18n/locales';
import { LanguagePicker } from './LanguagePicker';
import { useTr } from '@/i18n/website';
import { useSite } from '@/i18n/site';
import { copyrightLine, POLICY_PAGES as P } from '@/lib/legal';
import { useLegal } from './LegalProvider';

/**
 * The public footer (13 Nov, launch approvals): three columns of links as reviewers expect them
 * (Product, Resources, Company), then the operating company for the market on screen, the
 * country and language selectors side by side, and for India the registered office, CIN, phone
 * and email -- each only when it is configured.
 */
type Item = { label: string; href: string; only?: Market };
const COLUMNS: { title: string; items: Item[] }[] = [
  { title: 'Product', items: [
    { label: 'Ride', href: '/ride' }, { label: 'Drive', href: '/drive' },
    { label: 'Fares', href: P.fares }, { label: 'Safety', href: P.safety },
  ] },
  { title: 'Resources', items: [
    { label: 'Help', href: '/help' }, { label: 'Contact', href: P.contact },
    { label: 'Text messages', href: P.textMessages }, { label: 'Cookie notice', href: P.cookies },
    { label: 'Refunds and cancellations', href: P.refunds },
  ] },
  { title: 'Company', items: [
    { label: 'About', href: P.about }, { label: 'Rider terms', href: P.riderTerms },
    { label: 'Driver terms', href: P.driverTerms }, { label: 'Privacy policy', href: P.privacy },
    { label: 'Grievance redressal', href: P.grievance, only: 'IN' },
  ] },
];

export function Footer() {
  const tr = useTr();
  const s = useSite();
  const { market, entity, choose } = useLegal();
  const { setMarket } = useLocale();

  const onCountry = (m: Market) => {
    choose(m);
    setMarket(m);
  };

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
      <div className="s-wrap s-footer__top">
        <div className="s-footer__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="s-footer__mark" src="/brand/emblem-gold.svg" alt={tr('SaaradhiGo logo')} width={52} height={46} />
          <span className="s-footer__line">
            <span className="s-only-desk">{s.footer.line}</span>
            <span className="s-only-phone">{s.footer.lineShort}</span>
          </span>
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

      <div className="s-wrap s-footer__base">
        <div className="s-footer__entity">
          <span data-testid="footer-operated-by">{copyrightLine(entity)}</span>
          {details.length > 0 && (
            <span className="s-footer__details" data-testid="footer-details">{details.join(' · ')}</span>
          )}
        </div>
        <div className="s-footer__pickers">
          <label className="s-footer__pick">
            <span>{tr('Country')}</span>
            <select value={market} onChange={(e) => onCountry(e.target.value as Market)} data-testid="footer-country">
              {MARKETS.map((m) => <option key={m} value={m}>{MARKET_INFO[m].label}</option>)}
            </select>
          </label>
          {/* The same globe as the header: the languages are listed only when it is opened. */}
          <LanguagePicker />
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
