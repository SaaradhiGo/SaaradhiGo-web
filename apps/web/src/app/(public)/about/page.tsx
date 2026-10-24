import type { Metadata } from 'next';
import { AboutContent } from '@/components/pages/AboutContent';

export const metadata: Metadata = {
  title: 'About SaaradhiGo',
  description:
    'SaaradhiGo is a ride-hailing service built for Indian cities, where the '
    + 'fare is agreed before the trip begins.',
};

export default function AboutPage() {
  return <AboutContent />;
}
