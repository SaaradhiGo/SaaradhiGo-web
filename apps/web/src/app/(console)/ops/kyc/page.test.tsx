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
    permissions: ['driver.read', 'driver.review', 'driver.kyc'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const QUEUE = { count: 2, results: [
  { id: 31, ref: 'D-HYD-7K3Q', user_details: { full_name: 'Ravi Kumar' }, vehicle_type: 'auto', waiting_seconds: 7200, reviewer: { id: 1, name: 'Ops', me: true } },
  { id: 32, user_details: { full_name: 'Meena S' }, vehicle_type: 'bike', waiting_seconds: 3600, reviewer: null },
] };
const detail = (id: number, name: string) => ({
  id, ref: id === 31 ? 'D-HYD-7K3Q' : 'D-HYD-M3XA', approved: false, license_expiry: null, user: { full_name: name }, vehicles: [],
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
    expect(panel.textContent).toContain('D-HYD-7K3Q');
    fireEvent.click(screen.getByText('Meena S', { selector: 'td span' }));
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'KYC review' }).textContent).toContain('D-HYD-M3XA'));
  });

  it('names the reviewer, filters by reviewer and assigns the picked drivers to me', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, status: 200, json: async () => ({ status: 'success', data: { assigned: 1, reviewer: 1 } }) };
      return { ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Page />);
    await screen.findByRole('complementary', { name: 'KYC review' });
    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unassigned').some((e) => e.tagName === 'SPAN')).toBe(true);
    const boxes = screen.getAllByRole('checkbox', { name: 'Select row' });
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Assign to me' }));
    expect(await screen.findByText('1 driver assigned to you.')).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(String(post?.[0])).toContain('/driver/admin/kyc-queue/assign/');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ driver_ids: [32], reviewer: 'me' });
    fireEvent.change(screen.getAllByLabelText('Whose drivers')[0], { target: { value: 'none' } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('reviewer=none'))).toBe(true));
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = 'sg-staff-in=1; path=/';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
