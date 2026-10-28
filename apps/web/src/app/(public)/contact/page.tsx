import type { Metadata } from 'next';
import { ContactContent } from '@/components/pages/ContactContent';

export const metadata: Metadata = {
  title: 'Contact SaaradhiGo',
  description:
    'Get help with a ride, a payment or a driver application. Reach the '
    + 'SaaradhiGo support team.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return <ContactContent />;
}
