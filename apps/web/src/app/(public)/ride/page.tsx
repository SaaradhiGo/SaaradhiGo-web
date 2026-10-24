import type { Metadata } from 'next';
import { RideContent } from '@/components/pages/RideContent';

/**
 * METADATA IS IN THE DEPLOYMENT'S DEFAULT LANGUAGE, NOT THE VISITOR'S.
 * The language preference lives in the browser, and `generateMetadata` runs
 * on the server where it cannot be read, so a translated <title> would need
 * locale-prefixed routes (/te-IN/ride). That is a routing change, not a copy
 * change, and it is recorded as the remaining i18n gap rather than faked
 * here -- emitting the wrong hreflang or a title that disagrees with the
 * page body would be worse than an English title.
 */
export const metadata: Metadata = {
  title: 'Riding with SaaradhiGo',
  description:
    'How booking works on SaaradhiGo: set a pickup and destination, compare '
    + 'fares across vehicle classes, and track your trip with a ride PIN.',
};

export default function RidePage() {
  return <RideContent />;
}
