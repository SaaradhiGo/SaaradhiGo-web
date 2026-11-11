import { Suspense } from 'react';
import { RideChoose } from '@/components/area/rider/RideChoose';

// Suspense because the page reads its pickup and destination from the URL.
export default function RiderChoosePage() {
  return <Suspense fallback={null}><RideChoose /></Suspense>;
}
