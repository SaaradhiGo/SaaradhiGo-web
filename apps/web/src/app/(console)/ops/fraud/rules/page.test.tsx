import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/fraud/rules',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/lib/adminScope', async (orig) => ({
  ...(await orig<typeof import('@/lib/adminScope')>()),
  useAdminAccess: () => ({ permissions: [], scopes: [], access_model: 'scoped' }),
}));
vi.mock('@/lib/consoleLinks', async (orig) => ({
  ...(await orig<typeof import('@/lib/consoleLinks')>()),
  canOpen: () => true,
}));
vi.mock('@/lib/fraud', async (orig) => ({
  ...(await orig<typeof import('@/lib/fraud')>()),
  canReadFraud: () => true,
}));

describe('fraud rules page', () => {
  it('has the page head and renders its key section', async () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: 'Fraud & Risk' })).toBeTruthy();
    expect(await screen.findByText('No rules in your scope')).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  const data = { results: [] };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) })));
});
afterEach(() => cleanup());
