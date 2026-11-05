import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/support/inbox',
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: ['support.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const INBOX = { unread: 1, results: [
  { id: 1, kind: 'refund_returned', ticket_id: 40, text: 'Refund turned down', created_at: '2026-01-01T10:00:00Z', read: false },
  { id: 2, kind: 'refund_returned', ticket_id: 41, text: 'Refund withdrawn', created_at: '2026-01-02T10:00:00Z', read: true },
] };
const respond = (_url: string) => INBOX;

describe('support inbox page', () => {
  it('lists the items and the Unread view narrows them', async () => {
    render(<Page />);
    expect(await screen.findByText('Refund turned down')).toBeTruthy();
    expect(screen.getByText('Refund withdrawn')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Unread/ }));
    expect(screen.queryByText('Refund withdrawn')).toBeNull();
    expect(screen.getByText('Refund turned down')).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
