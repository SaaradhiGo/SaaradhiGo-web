import { Suspense } from 'react';
import { DriverSetup } from '@/components/area/driver/setup/DriverSetup';

/** /driver/setup opens the next unfinished step. */
export default function Page() {
  return <Suspense fallback={null}><DriverSetup slug="" /></Suspense>;
}
