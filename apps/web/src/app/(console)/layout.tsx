'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { clearTokens, readToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  // SOS sits directly under the dashboard: it is the only screen with a
  // zero error budget, and on-call should never have to hunt for it.
  { href: '/sos', label: 'SOS' },
  { href: '/trips', label: 'Trips' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/withdrawals', label: 'Withdrawals' },
  { href: '/support', label: 'Support' },
  { href: '/zones', label: 'Zones' },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!readToken()) router.replace('/login');
  }, [router]);

  function signOut() {
    clearTokens();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen grid grid-cols-[220px_1fr]">
      <aside className="bg-ink-800 border-r border-white/5 p-4 flex flex-col">
        <div className="text-brand font-bold text-lg tracking-wider">SaaradhiGo</div>
        <div className="text-white/40 text-xs uppercase tracking-widest mb-6">Ops</div>
        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm transition ${
                  active ? 'bg-brand text-black font-semibold' : 'text-white/80 hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut} className="btn-ghost text-left text-sm mt-6">
          Sign out
        </button>
      </aside>
      <main className="p-6">{children}</main>
    </div>
  );
}
