import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Privacy policy — SaaradhiGo',
  description: 'What personal data SaaradhiGo collects, why, how long it is kept, and your rights.',
  alternates: { canonical: '/privacy' },
});

export default function Page() {
  return <LegalDoc kind="privacy" />;
}
