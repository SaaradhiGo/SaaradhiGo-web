import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '5' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/fraud/5',
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
    permissions: ['fraud.read', 'fraud.review'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const DETAIL = {
  id: 5, kind: 'referral_abuse', status: 'open', severity: 'high', score: 80, rule_key: 'referral_abuse', rule_version: 1, hit_count: 1,
  subject: { ref: 'R-12', role: 'rider', user_id: 12, href: '/riders/12' }, evidence: { signals: [], measures: {} }, source_ref: '',
  scope: 'IN', scope_name: 'Hyderabad', assigned_to: null, assigned_at: null, decision_reason: '', decision_note: '',
  decided_by: null, decided_at: null, created_at: '2026-01-01T10:00:00Z', last_seen_at: null, age_hours: 3,
  may_review: true, linked: { accounts: [], outside_scope: 0, outside_scope_label: null },
  related: { trips: [], trip_count: 0, campaigns: [] }, handoffs: [], handoffs_taken: [],
  timeline: [{ id: 1, action: 'assigned', from_status: '', to_status: '', reason: '', note: 'taking this', actor: { id: 1, label: 'Asha' }, data: {}, at: '2026-01-01T11:00:00Z' }],
};
const respond = (_url: string) => DETAIL;

describe('fraud flag record page', () => {
  it('shows the flag ref and the timeline under History', async () => {
    render(<Page />);
    expect(await screen.findByText('Flag #5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm fraud' })).toBeTruthy();
    expect(screen.queryByText(/taking this/)).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText(/taking this/)).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: respond(String(url)) }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
