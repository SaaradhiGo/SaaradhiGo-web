import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/kyc',
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
    permissions: ['driver.read', 'driver.review'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const QUEUE = { count: 2, results: [
  { id: 31, user_details: { full_name: 'Ravi Kumar' }, vehicle_type: 'auto', waiting_seconds: 7200 },
  { id: 32, user_details: { full_name: 'Meena S' }, vehicle_type: 'bike', waiting_seconds: 3600 },
] };
const detail = (id: number, name: string) => ({
  id, approved: false, license_expiry: null, user: { full_name: name }, vehicles: [],
  documents: [{ key: 'licence_front', label: 'Licence (front)', owner: 'driver', vehicle_id: null, present: false, recordable: true,
    viewable: true, url_withheld: false, review_state: 'pending', review: null }],
  actions: { review_documents: true, approve: true }, approval_blockers: [],
});
const respond = (url: string) => {
  const m = url.match(/\/driver\/admin\/(\d+)\/full\//);
  if (m) return m[1] === '31' ? detail(31, 'Ravi Kumar') : detail(32, 'Meena S');
  return QUEUE;
};

describe('KYC review page', () => {
  it('lists the queue and reviews the active driver in a record panel; a queue row jumps to that driver', async () => {
    render(<Page />);
    const panel = await screen.findByRole('complementary', { name: 'KYC review' });
    expect(panel.textContent).toContain('D-31');
    fireEvent.click(screen.getByText('Meena S', { selector: 'td span' }));
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'KYC review' }).textContent).toContain('D-32'));
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
