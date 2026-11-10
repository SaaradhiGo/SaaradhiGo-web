import { Suspense } from 'react';
import { DriverTrips } from '@/components/area/driver/DriverTrips';

export default function Page() {
  return <Suspense fallback={null}><DriverTrips /></Suspense>;
}
