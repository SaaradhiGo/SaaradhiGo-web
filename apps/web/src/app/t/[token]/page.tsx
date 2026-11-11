import type { Metadata } from 'next';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { SharedTrip } from '@/components/area/SharedTrip';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { requestLanguage } from '@/i18n/server';

// A trip a rider shared with their trusted contacts (9 Nov). Never indexed,
// never cached; the page reads only the public, privacy-trimmed payload.
export const metadata: Metadata = {
  title: 'Shared trip · SaaradhiGo',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <LocaleProvider initialLanguage={await requestLanguage()}>
      <LocaleHead />
      <SharedTrip token={token} />
    </LocaleProvider>
  );
}
