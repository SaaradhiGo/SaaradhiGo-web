import { localized } from '@/i18n/server';
import { DriveContent } from '@/components/pages/DriveContent';

export const generateMetadata = localized({
  title: 'Drive with SaaradhiGo',
  description:
    'Apply to drive with SaaradhiGo. Upload your licence, registration and '
    + 'insurance, and start accepting trips once your documents are approved.',
  alternates: { canonical: '/drive' },
});

export default function DrivePage() {
  return <DriveContent />;
}
