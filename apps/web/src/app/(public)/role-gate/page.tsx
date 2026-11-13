import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RoleGate } from '@/components/pages/RoleGate';

// 13 Nov: served by the middleware at the URL asked for, when it belongs to the other role.
export const metadata: Metadata = { title: 'SaaradhiGo', robots: { index: false, follow: false } };

export default function RoleGatePage() {
  return (
    <Suspense fallback={null}>
      <RoleGate />
    </Suspense>
  );
}
