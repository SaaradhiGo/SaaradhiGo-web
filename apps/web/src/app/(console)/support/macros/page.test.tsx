import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/support/macros',
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
vi.mock('@/lib/supportDesk', async (orig) => ({
  ...(await orig<typeof import('@/lib/supportDesk')>()),
  canManageMacros: () => true,
}));

describe('support macros page', () => {
  it('has the page head and renders its key section', async () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: 'Macros' })).toBeTruthy();
    expect(await screen.findByText('Refund note')).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  const data = { results: [{ id: 1, title: 'Refund note', body: 'Hi {first_name}', locale: 'en', country: null, issue_types: [], active: true, version: 1 }] };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) })));
});
afterEach(() => cleanup());
