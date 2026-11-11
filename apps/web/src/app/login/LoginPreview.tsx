'use client';

import Link from 'next/link';
import './login-preview.css';

/**
 * The strip that reaches every sign-in state for review.
 *
 * THIS FILE IS NOT IN A PRODUCTION BUNDLE. `app/login/page.tsx` imports it
 * through `next/dynamic` inside a branch on the build-time constant
 * `NEXT_PUBLIC_CONSOLE_PREVIEW === 'true'`; when that is not set the branch
 * is dead at compile time, the import is never emitted, and this file,
 * its stylesheet and the `?preview=` handling do not exist in the output.
 * `scripts/check-no-preview.mjs` searches the built output for the marker
 * below and fails the build if it finds one.
 *
 * Set `NEXT_PUBLIC_CONSOLE_PREVIEW=true` on QA and local builds only.
 */
export const PREVIEW_MARKER = 'console-preview-strip';

export const PREVIEW_STATES = [
  'credentials', 'totp', 'recovery', 'reason', 'password', 'codes', 'locked', 'expired',
] as const;

export function LoginPreview({ current }: { current: string }) {
  return (
    <nav className="login__preview" data-marker={PREVIEW_MARKER} aria-label="Preview sign-in states (not built for production)">
      {PREVIEW_STATES.map((s) => (
        <Link
          key={s}
          href={s === 'credentials' ? '/login' : `/login?preview=${s}`}
          aria-current={current === s ? 'true' : undefined}
        >
          {s}
        </Link>
      ))}
    </nav>
  );
}
