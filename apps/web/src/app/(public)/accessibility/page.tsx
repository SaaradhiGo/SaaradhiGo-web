import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Non-discrimination and accessibility — SaaradhiGo',
  description: 'Every rider is served. Service animals, wheelchairs and how to report a problem.',
  alternates: { canonical: '/accessibility' },
});

export default function Page() {
  return <LegalDoc kind="accessibility" />;
}
