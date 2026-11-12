import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Text messages — SaaradhiGo',
  description: 'The text messages SaaradhiGo sends, how often, and how to stop them.',
  alternates: { canonical: '/text-messages' },
});

export default function Page() {
  return <LegalDoc kind="textMessages" />;
}
