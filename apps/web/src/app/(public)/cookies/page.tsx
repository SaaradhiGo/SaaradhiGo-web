import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Cookie notice — SaaradhiGo',
  description: 'The cookies and browser storage the SaaradhiGo website uses.',
  alternates: { canonical: '/cookies' },
});

export default function Page() {
  return <LegalDoc kind="cookies" />;
}
