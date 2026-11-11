import type { Metadata } from 'next';
import { DriverShell } from '@/components/area/DriverShell';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { requestLanguage } from '@/i18n/server';

// The driver's area (owner, 2026-11-08), at /driver and below; the middleware
// sends everyone else away. Never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider initialLanguage={await requestLanguage()}>
      <LocaleHead />
      <DriverShell>{children}</DriverShell>
    </LocaleProvider>
  );
}
