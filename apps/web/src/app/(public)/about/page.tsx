import { localized } from '@/i18n/server';
import { AboutContent } from '@/components/pages/AboutContent';

export const generateMetadata = localized({
  title: 'About SaaradhiGo',
  description:
    'SaaradhiGo is a ride-hailing service built for Indian cities, where the '
    + 'fare is agreed before the trip begins.',
  alternates: { canonical: '/about' },
});

export default function AboutPage() {
  return <AboutContent />;
}
