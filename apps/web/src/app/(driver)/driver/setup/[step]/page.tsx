import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DriverSetup } from '@/components/area/driver/setup/DriverSetup';
import { resolveSlug } from '@/lib/area/setupSlugs';

export default async function Page({ params, searchParams }: {
  params: Promise<{ step: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { step } = await params;
  // An unknown or older address (11 Nov: /driver/setup/licence) opens its step or the setup start.
  const got = resolveSlug(step);
  if ('redirect' in got) {
    const from = (await searchParams).from;
    redirect(typeof from === 'string' ? `${got.redirect}?from=${encodeURIComponent(from)}` : got.redirect);
  }
  return <Suspense fallback={null}><DriverSetup slug={step} /></Suspense>;
}
