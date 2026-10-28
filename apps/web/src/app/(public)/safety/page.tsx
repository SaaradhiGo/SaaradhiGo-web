import type { Metadata } from 'next';
import { SafetyContent } from '@/components/pages/SafetyContent';

export const metadata: Metadata = {
  title: 'Safety at SaaradhiGo',
  description:
    'The safety features running on SaaradhiGo today: a server-verified ride '
    + 'PIN, live trip tracking, and safety alerts that reach our operations '
    + 'team.',
  alternates: { canonical: '/safety' },
};

export default function SafetyPage() {
  return <SafetyContent />;
}
