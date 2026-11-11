import { localized } from '@/i18n/server';
import { HelpContent } from '@/components/pages/HelpContent';

export const generateMetadata = localized({
  title: 'Help — SaaradhiGo',
  description:
    'Get help with a SaaradhiGo ride, your account, payments, safety, or '
    + 'driving with us.',
  alternates: { canonical: '/help' },
});

export default function HelpPage() {
  return <HelpContent />;
}
