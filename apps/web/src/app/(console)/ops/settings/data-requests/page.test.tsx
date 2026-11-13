import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/ops/settings/data-requests',
}));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'root@example.test', full_name: 'Root', is_superuser: false, is_break_glass: false,
    permissions: ['privacy.manage'], roles: [], scopes: [], access_model: 'assignments',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});

const row = (id: number, over: Record<string, unknown> = {}) => ({
  id, ref: `DR-${id}`, kind: 'erasure', kind_label: 'Erasure', subject_id: 57, subject_ref: 'R-57', subject_role: 'rider',
  subject_name: `Person ${id}`, subject_phone: '+91****10', country: 'IN', channel: 'email', channel_label: 'Email',
  reference: 'mail-1', note: '', status: 'open', status_label: 'Open', received_at: '2026-10-01T00:00:00Z',
  due_at: '2026-10-31T00:00:00Z', closed_at: null, overdue: false, outcome: '', approval_request_id: null,
  created_by: 'Root', handled_by: null, ...over,
});
let rows: ReturnType<typeof row>[] = [];
const calls: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  rows = [row(3, { overdue: true }), row(4, { status: 'completed', status_label: 'Completed' })];
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    const one = u.match(/data-requests\/(\d+)\/(\w+\/)?$/);
    let data: unknown = { count: rows.length, results: rows, open: 1, overdue: 1, due_days: 30 };
    if (init?.method === 'POST') {
      data = one ? row(Number(one[1]), { status: 'waiting_approval', status_label: 'Waiting for approval', approval_request_id: 9 }) : row(5);
    } else if (one) {
      data = { ...rows.find((r) => r.id === Number(one[1]))!, history: [] };
    }
    return { ok: true, status: init?.method === 'POST' ? 201 : 200, json: async () => ({ status: 'success', data }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Data requests page', () => {
  it('lists requests with the overdue chip and the summary', async () => {
    render(<Page />);
    expect(await screen.findByText('Person 3')).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('1 open · 1 overdue · due within 30 days')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'R-57' })[0].getAttribute('href')).toBe('/ops/riders/57');
  });

  it('posts the logged request', async () => {
    render(<Page />);
    await screen.findByText('Person 3');
    fireEvent.click(screen.getByRole('button', { name: 'Log a request…' }));
    fireEvent.change(screen.getByLabelText('Person (R-… or D-…)'), { target: { value: 'D-12' } });
    fireEvent.change(screen.getByLabelText('Kind', { selector: '#dr-kind' }), { target: { value: 'erasure' } });
    fireEvent.change(screen.getByLabelText('How it arrived'), { target: { value: 'ticket' } });
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'TCK-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log request' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toContain('/auth/admin/data-requests/');
    expect(JSON.parse(post.body!)).toEqual({ subject: 'D-12', kind: 'erasure', channel: 'ticket', reference: 'TCK-9' });
  });

  it('asks to erase with a reason and shows the request waiting', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText('Person 3'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask to erase…' }));
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Rider asked by email' } });
    rows[0] = row(3, { overdue: true, status: 'waiting_approval', status_label: 'Waiting for approval', approval_request_id: 9 });
    fireEvent.click(screen.getByRole('button', { name: 'Ask to erase' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/3/erase/'))).toBe(true));
    const post = calls.find((c) => c.url.includes('/3/erase/'))!;
    expect(JSON.parse(post.body!)).toEqual({ reason: 'Rider asked by email' });
    const link = await screen.findByRole('link', { name: 'open the approval' });
    expect(link.getAttribute('href')).toBe('/ops/approvals?id=9');
  });

  it('offers no actions on a completed request', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText('Person 4'));
    await screen.findByRole('tab', { name: 'History' });
    expect(screen.queryByRole('button', { name: 'Ask to erase…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refuse…' })).toBeNull();
  });
});
