'use client';

import Link from 'next/link';
import { type AdminAccess, selectedMarket } from '@/lib/adminScope';
import { LEGAL_FALLBACK, POLICY_PAGES as P } from '@/lib/legal';

/**
 * "Operated by ..." for the console's own footer, from the market switch.
 *
 * The public site and the apps decide the operating company from the visitor
 * (`LegalProvider`). The console has no visitor market: it has the switch. So
 * United States names DeepTrics LLC, India names DeepTrics Software Solutions
 * Pvt Ltd, and Global (or everything held, across both) names both companies.
 */
export function consoleOperatedBy(market: 'IN' | 'US' | null): string {
  if (market) return `Operated by ${LEGAL_FALLBACK[market].legal_name}.`;
  return `Operated by ${LEGAL_FALLBACK.IN.legal_name} (India) and ${LEGAL_FALLBACK.US.legal_name} (United States).`;
}

export function ConsoleLegalLine({ access, now = new Date() }: { access: AdminAccess | null; now?: Date }) {
  const market = selectedMarket(access);
  return (
    <footer className="sg-legal-line" data-testid="legal-line" data-market={market ?? 'all'}>
      <span>© {now.getFullYear()} SaaradhiGo. {consoleOperatedBy(market)}</span>
      <span className="sg-legal-line__links">
        <Link href={P.riderTerms}>Terms</Link>
        <Link href={P.privacy}>Privacy</Link>
        <Link href={P.contact}>Contact</Link>
      </span>
    </footer>
  );
}
