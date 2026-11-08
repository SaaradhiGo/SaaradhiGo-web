import type { Metadata } from 'next';
import { RiderShell } from '@/components/area/RiderShell';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { requestLanguage } from '@/i18n/server';

// The rider's area (owner, 2026-11-08). Served at /ride, /trips and /account
// by the middleware's rewrite; never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RiderLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider initialLanguage={await requestLanguage()}>
      <LocaleHead />
      <RiderShell>{children}</RiderShell>
    </LocaleProvider>
  );
}
