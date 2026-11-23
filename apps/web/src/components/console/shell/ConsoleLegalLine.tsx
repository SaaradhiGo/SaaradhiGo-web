'use client';

import { type AdminAccess, selectedMarket } from '@/lib/adminScope';
import { LEGAL_FALLBACK } from '@/lib/legal';

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
    // 22 Nov (owner): a slim console footer. The public site's Terms, Privacy and Contact do not
    // belong inside the console; staff reach policies from the public site.
    <footer className="sg-legal-line sg-legal-line--console" data-testid="legal-line" data-market={market ?? 'all'}>
      <span>© {now.getFullYear()} SaaradhiGo Admin · Staff access only · {consoleOperatedBy(market)}</span>
    </footer>
  );
}
