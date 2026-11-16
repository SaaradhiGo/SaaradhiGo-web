import { localized } from '@/i18n/server';
import { CompanyBlock } from '@/components/pages/CompanyBlock';
import { ContactContent } from '@/components/pages/ContactContent';

export const generateMetadata = localized({
  title: 'Contact SaaradhiGo',
  description:
    'Get help with a ride, a payment or a driver application. Reach the '
    + 'SaaradhiGo support team.',
  alternates: { canonical: '/contact' },
});

export default function ContactPage() {
  return (
    <>
      <ContactContent />
      <CompanyBlock />
    </>
  );
}
