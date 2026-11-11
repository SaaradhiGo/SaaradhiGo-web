import { Suspense } from 'react';
import { DriverEarnings } from '@/components/area/driver/DriverEarnings';

export default function Page() {
  return <Suspense fallback={null}><DriverEarnings /></Suspense>;
}
