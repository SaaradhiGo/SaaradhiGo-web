import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Refunds and cancellations — SaaradhiGo',
  description: 'When a SaaradhiGo cancellation fee applies, and how refunds work.',
  alternates: { canonical: '/refunds' },
});

export default function Page() {
  return <LegalDoc kind="refunds" />;
}
