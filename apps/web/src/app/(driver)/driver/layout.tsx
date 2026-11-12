import type { Metadata } from 'next';
import { DriverShell } from '@/components/area/DriverShell';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { requestLanguage, requestLegalMarket } from '@/i18n/server';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { fetchLegal } from '@/lib/legal';

// The driver's area (owner, 2026-11-08), at /driver and below; the middleware
// sends everyone else away. Never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const [legal, where] = await Promise.all([fetchLegal(), requestLegalMarket()]);
  return (
    <LocaleProvider initialLanguage={await requestLanguage()}>
      <LegalProvider legal={legal} initialMarket={where.market} decided={where.decided}>
        <LocaleHead />
        <DriverShell>{children}</DriverShell>
      </LegalProvider>
    </LocaleProvider>
  );
}
