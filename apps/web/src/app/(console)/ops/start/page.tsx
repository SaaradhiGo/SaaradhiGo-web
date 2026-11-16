'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAdminAccess } from '@/lib/adminScope';
import { landingFor } from '@/lib/landing';

/** Sends each operator to their role's landing page (`lib/landing.ts`). */
export default function StartPage() {
  const access = useAdminAccess();
  const router = useRouter();
  useEffect(() => {
    if (access !== null && access !== undefined) router.replace(landingFor(access));
  }, [access, router]);
  return (
    <div className="ops-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">Opening your workspace</span>
    </div>
  );
}
