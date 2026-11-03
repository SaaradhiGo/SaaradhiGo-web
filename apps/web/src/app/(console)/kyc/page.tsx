'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** The KYC queue's own address. The review screen (design board E) replaces this. */
export default function KycPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/drivers?tab=queue'); }, [router]);
  return <div className="ops-loading" aria-busy="true"><span className="sr-only">Opening the KYC queue</span></div>;
}
