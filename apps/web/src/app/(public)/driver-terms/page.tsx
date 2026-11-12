import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Driver terms — SaaradhiGo',
  description: 'The terms on which you drive with SaaradhiGo.',
  alternates: { canonical: '/driver-terms' },
});

export default function Page() {
  return <LegalDoc kind="driverTerms" />;
}
