import { Suspense } from 'react';
import { DriverSetup } from '@/components/area/driver/setup/DriverSetup';

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  return <Suspense fallback={null}><DriverSetup slug={step} /></Suspense>;
}
