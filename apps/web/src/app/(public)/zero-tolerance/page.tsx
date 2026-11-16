import { localized } from '@/i18n/server';
import { LegalDoc } from '@/components/pages/LegalDoc';

export const generateMetadata = localized({
  title: 'Zero tolerance for drugs and alcohol — SaaradhiGo',
  description: 'No driver may use illegal drugs or alcohol while logged in. How to report a driver, and what happens next.',
  alternates: { canonical: '/zero-tolerance' },
});

export default function Page() {
  return <LegalDoc kind="zeroTolerance" />;
}
