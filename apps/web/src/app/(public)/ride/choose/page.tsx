import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RideChoose } from '@/components/area/rider/RideChoose';

// 14 Nov (owner): a visitor sees the fares for their trip; signing in is asked only at Book.
// A signed-in rider is rewritten to the rider area's copy of this page (lib/session/routing.ts).
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Choose a ride — SaaradhiGo' };

export default function GuestChoosePage() {
  return (
    <div className="ar" data-area="rider">
      <Suspense fallback={null}><RideChoose guest /></Suspense>
    </div>
  );
}
