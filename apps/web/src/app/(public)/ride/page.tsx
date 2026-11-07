import { localized } from '@/i18n/server';
import { RideContent } from '@/components/pages/RideContent';

export const generateMetadata = localized({
  title: 'Riding with SaaradhiGo',
  description:
    'How booking works on SaaradhiGo: set a pickup and destination, compare '
    + 'fares across vehicle classes, and track your trip with a ride code.',
  alternates: { canonical: '/ride' },
});

export default function RidePage() {
  return <RideContent />;
}
