import { localized } from '@/i18n/server';
import { SafetyContent } from '@/components/pages/SafetyContent';

export const generateMetadata = localized({
  title: 'Safety at SaaradhiGo',
  description:
    'The safety features running on SaaradhiGo today: a server-verified '
    + 'ride code, live trip tracking, and safety alerts that reach our operations '
    + 'team.',
  alternates: { canonical: '/safety' },
});

export default function SafetyPage() {
  return <SafetyContent />;
}
