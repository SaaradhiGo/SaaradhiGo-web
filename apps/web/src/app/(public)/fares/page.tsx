import { localized } from '@/i18n/server';
import { FaresContent } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Fares — SaaradhiGo',
  description: 'How SaaradhiGo works out a fare, the rates in each city, and the cancellation fee.',
  alternates: { canonical: '/fares' },
});

export default function FaresPage() {
  return <FaresContent />;
}
