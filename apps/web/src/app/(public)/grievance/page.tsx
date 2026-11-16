import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Grievance redressal — SaaradhiGo',
  description: 'How to raise a complaint with SaaradhiGo in India, and how fast we answer.',
  alternates: { canonical: '/grievance' },
});

export default function Page() {
  return <LegalDoc kind="grievance" />;
}
