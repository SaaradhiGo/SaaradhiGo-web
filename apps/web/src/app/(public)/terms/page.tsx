import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Rider terms — SaaradhiGo',
  description: 'The terms on which you book and take rides with SaaradhiGo.',
  alternates: { canonical: '/terms' },
});

export default function Page() {
  return <LegalDoc kind="riderTerms" />;
}
