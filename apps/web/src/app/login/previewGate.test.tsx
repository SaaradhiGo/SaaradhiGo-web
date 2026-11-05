/**
 * The review strip is behind a build flag AND a runtime host check: with the
 * flag on, the real console host still shows nothing.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isQaHost } from '@/lib/qaHost';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<React.ComponentType<{ current: string }>>) => {
    const { lazy, Suspense } = require('react');
    const L = lazy(async () => ({ default: await load() }));
    return (p: { current: string }) => <Suspense fallback={null}><L {...p} /></Suspense>;
  },
}));

function atHost(hostname: string) {
  Object.defineProperty(window, 'location', { value: { ...window.location, hostname }, configurable: true });
}

async function renderLogin() {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_CONSOLE_PREVIEW', 'true');
  const { default: Page } = await import('./page');
  return render(<Page />);
}

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('sign-in preview strip', () => {
  it('does not render on the console host even with the flag on', async () => {
    atHost('console.saaradhigo.com');
    const { container } = await renderLogin();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-marker="console-preview-strip"]')).toBeNull();
  });

  it('renders on a QA host with the flag on', async () => {
    atHost('qa.saaradhigo.com');
    await renderLogin();
    expect(await screen.findByRole('navigation', { name: /preview sign-in states/i })).toBeTruthy();
  });

  it('classifies hosts', () => {
    for (const h of ['localhost', '127.0.0.1', 'www.qa.saaradhigo.com', 'web-qa-800c.up.railway.app']) expect(isQaHost(h)).toBe(true);
    for (const h of ['console.saaradhigo.com', 'saaradhigo.com', 'web-prod.up.railway.app', 'qa.saaradhigo.com.evil.io', '']) expect(isQaHost(h)).toBe(false);
  });
});
