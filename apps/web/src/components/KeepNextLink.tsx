'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { safeReturnTo } from '@/lib/returnTo';

/**
 * A link between the auth screens that keeps `?next=` with it.
 *
 * The forms send a rider back to the booking they came from, but the links
 * BETWEEN those forms did not: a rider who pressed "Sign in to confirm
 * Sedan", arrived at the sign-in and then followed "Create an account" lost
 * the trip on that one click. They registered, landed on the homepage, and
 * had to search for their pickup and destination again -- which is exactly
 * what was reported as "after created account again came to landing page and
 * lost the details which I entered".
 *
 * `safeReturnTo` is applied before the value is re-emitted, so a crafted
 * `next` cannot be laundered from one screen to the next.
 */
export function KeepNextLink({
  href,
  children,
  className = 'sg-link',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const search = useSearchParams();
  const next = safeReturnTo(search.get('next'), '');
  const to = next ? `${href}?next=${encodeURIComponent(next)}` : href;
  return (
    <Link href={to} className={className}>
      {children}
    </Link>
  );
}
