import type { Metadata } from 'next';
import { RiderShell } from '@/components/area/RiderShell';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { requestLanguage, requestLegalMarket } from '@/i18n/server';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { fetchLegal } from '@/lib/legal';

// The rider's area (owner, 2026-11-08). Served at /ride, /trips and /account
// by the middleware's rewrite; never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  const [legal, where] = await Promise.all([fetchLegal(), requestLegalMarket()]);
  return (
    <LocaleProvider initialLanguage={await requestLanguage()}>
      <LegalProvider legal={legal} initialMarket={where.market} decided={where.decided}>
        <LocaleHead />
        <RiderShell>{children}</RiderShell>
      </LegalProvider>
    </LocaleProvider>
  );
}
