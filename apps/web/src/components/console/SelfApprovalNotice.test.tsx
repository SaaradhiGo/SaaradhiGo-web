/**
 * The Command Centre says when self-approval is on, and how many decisions
 * were self-approved, linking to them (owner, 2026-11-03).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import { SelfApprovalNotice } from './SelfApprovalNotice';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const ACCESS = { permissions: ['report.read', 'approval.check'], roles: [], scopes: [], access_model: 'assignments' };
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => ACCESS };
});

function answer(data: unknown, ok = true) {
  const fetchMock = vi.fn(async (_url: string) => ({ ok, status: ok ? 200 : 403, json: async () => (ok ? { status: 'success', data } : { error: { code: 'FORBIDDEN' } }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => { window.localStorage.clear(); window.localStorage.setItem(TOKEN_KEY, 'access-1'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SelfApprovalNotice', () => {
  it('counts the self-approved decisions and links to them while the exception is on', async () => {
    const fetchMock = answer({ count: 3, results: [], self_approval_on: true });
    render(<SelfApprovalNotice />);
    const link = await screen.findByRole('link', { name: '3 decisions self-approved' });
    expect(link.getAttribute('href')).toBe('/ops/approvals?view=self');
    expect(screen.getByText(/Self-approval is on/)).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toContain('self_approved=1');
  });

  it('shows nothing while the exception is off', async () => {
    const fetchMock = answer({ count: 0, results: [], self_approval_on: false });
    const { container } = render(<SelfApprovalNotice />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing to someone who cannot read approvals', async () => {
    const fetchMock = answer(null, false);
    const { container } = render(<SelfApprovalNotice />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
