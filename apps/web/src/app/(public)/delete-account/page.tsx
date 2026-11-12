import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Delete your account — SaaradhiGo',
  description: 'How to delete your SaaradhiGo account with or without the app, and what we must keep.',
  alternates: { canonical: '/delete-account' },
});

export default function Page() {
  return <LegalDoc kind="deleteAccount" />;
}
