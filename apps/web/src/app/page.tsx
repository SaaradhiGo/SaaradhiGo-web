'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readToken } from '@/lib/api';

// Root redirects to /login or /dashboard depending on session state.
// Kept a client component so we read localStorage without an
// app-router server detour.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const t = readToken();
    router.replace(t ? '/dashboard' : '/login');
  }, [router]);
  return (
    <main className="min-h-screen flex items-center justify-center text-white/70">
      Loading...
    </main>
  );
}
