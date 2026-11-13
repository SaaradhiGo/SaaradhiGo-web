import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/settings/staff',
}));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'root@example.test', full_name: 'Root', is_superuser: false, is_break_glass: false,
    permissions: ['admin.manage'], roles: [], scopes: [], access_model: 'assignments',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const assignment = { id: 5, role: 'support_agent', role_name: 'Support Agent', scope: 'IN', scope_name: 'India', scope_kind: 'country',
  is_active: true, granted_by: 'Root', reason: 'Joined support', created_at: '2026-10-01T00:00:00Z' };
const person = (id: number, name: string, assignments: unknown[]) => ({
  id, ref: `OP-${id}`, name, email: 'a***@x.test', phone: '', is_active: true, is_superuser: false, is_break_glass: false,
  invite_pending: false, mfa_enrolled: true, last_login: null, created_at: '2026-10-01T00:00:00Z', assignments,
});
const LIST = { count: 2, super_admins: 1, results: [person(2, 'Asha Rao', [assignment]), person(3, 'Bala K', [])] };
const OPTIONS = {
  roles: [{ code: 'support_agent', name: 'Support Agent', description: 'Answers tickets', global_only: false,
    permissions: [{ code: 'support.read', label: 'Read tickets' }] }],
  scopes: [{ code: 'GLOBAL', name: 'Everywhere', kind: 'global' }, { code: 'IN', name: 'India', kind: 'country' }],
};
let isSelf = false;
const detail = (id: number) => ({ ...(id === 2 ? LIST.results[0] : LIST.results[1]), is_self: isSelf, history: [] });

const calls: { url: string; method: string; body?: string }[] = [];
let deactivateStatus = 200;
beforeEach(() => {
  isSelf = false; deactivateStatus = 200; calls.length = 0;
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (init?.method === 'POST') {
      if (u.includes('/deactivate/') && deactivateStatus === 409) {
        return { ok: false, status: 409, json: async () => ({ status: 'error', error: { code: 'floor', message: 'server text' } }) };
      }
      return { ok: true, status: 201, json: async () => ({ status: 'success', data: {} }) };
    }
    const data = u.includes('/options/') ? OPTIONS : /staff\/\d+\/$/.test(u) ? detail(Number(u.match(/staff\/(\d+)\//)![1])) : LIST;
    return { ok: true, status: 200, json: async () => ({ status: 'success', data }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Staff and roles page', () => {
  it('lists people with their roles and a banner when one Super Admin is left', async () => {
    render(<Page />);
    expect(await screen.findByText('Asha Rao')).toBeTruthy();
    expect(screen.getByText('Support Agent @ India')).toBeTruthy();
    expect(screen.getByText('No role yet')).toBeTruthy();
    expect(screen.getByText('Only 1 Super Admin: appoint a second.')).toBeTruthy();
  });

  it('posts role, scope and reason from the give-a-role form', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText('Asha Rao'));
    await screen.findByRole('form', { name: 'Give a role' });
    fireEvent.change(screen.getByLabelText('Role', { selector: '#gr-role' }), { target: { value: 'support_agent' } });
    expect(screen.getByText('Read tickets')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Place'), { target: { value: 'IN' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Covers nights' } });
    fireEvent.click(screen.getByRole('button', { name: 'Give role' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toContain('/admin-access/staff/2/assignments/');
    expect(JSON.parse(post.body!)).toEqual({ role: 'support_agent', scope: 'IN', reason: 'Covers nights' });
  });

  it('shows the floor message when deactivating is refused with 409', async () => {
    deactivateStatus = 409;
    render(<Page />);
    fireEvent.click(await screen.findByText('Asha Rao'));
    fireEvent.click(await screen.findByRole('tab', { name: 'Account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate…' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Left the team' } });
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText(/last Super Admin allowed/)).toBeTruthy();
  });

  it('offers no write buttons on your own record', async () => {
    isSelf = true;
    render(<Page />);
    fireEvent.click(await screen.findByText('Asha Rao'));
    await screen.findByText(/your own account/);
    expect(screen.queryByRole('form', { name: 'Give a role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take away…' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Account' }));
    expect(screen.queryByRole('button', { name: 'Deactivate…' })).toBeNull();
  });
});
