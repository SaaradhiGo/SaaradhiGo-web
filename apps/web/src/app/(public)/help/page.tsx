import type { Metadata } from 'next';
import { HelpContent } from '@/components/pages/HelpContent';

export const metadata: Metadata = {
  title: 'Help — SaaradhiGo',
  description:
    'Get help with a SaaradhiGo ride, your account, payments, safety, or '
    + 'driving with us.',
};

export default function HelpPage() {
  return <HelpContent />;
}
