/**
 * The Platform Settings shell (module 15): which tabs an operator sees (the link rule) and who is
 * offered the Approve and Decline buttons on a request awaiting a checker.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { Pending } from '@/lib/platform';
import { PendingRequests, PlatformNav, outcomeNotice } from '@/components/console/platform';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/flags' }));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

let current: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => current };
});

const post = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, post: (...args: unknown[]) => post(...args) } };
});

afterEach(() => { cleanup(); post.mockReset(); });

function access(permissions: string[], id = 1): AdminAccess {
  return {
    id, email: 'a@saaradhigo.test', full_name: 'A', is_superuser: false, is_break_glass: false, permissions,
    roles: [], scopes: [], access_model: 'assignments', super_admin_shortfall: 0,
  };
}

const request: Pending = {
  id: 9, target: 'XX-AA-BBB', to_status: 'live', reason: 'Ready to launch', maker_label: 'Maker One',
  maker_id: 7, requested_at: '2026-10-31T10:00:00Z', expires_at: null,
};

describe('the tabs', () => {
  it('draws only the tabs the operator can open, and marks the current one', () => {
    current = access(['platform.read', 'platform.city_pause', 'audit.read']);
    render(<PlatformNav />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/settings', '/settings/flags', '/settings/app-versions', '/settings/notices', '/settings/audit']);
    expect(screen.getByRole('link', { name: 'Feature flags' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Markets' }).getAttribute('aria-current')).toBeNull();
  });

  it('draws nothing for an operator with none of the capabilities', () => {
    current = access(['trip.read']);
    const { container } = render(<PlatformNav />);
    expect(container.querySelector('nav')).toBeNull();
  });
});

describe('a request awaiting a checker', () => {
  it('offers Approve and Decline to a different admin who holds approval.check', () => {
    current = access(['approval.check'], 8);
    render(<PendingRequests items={[request]} onDecided={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(screen.getByText(/Launch XX-AA-BBB/)).toBeTruthy();
  });

  it('never offers them to the maker, nor to someone without approval.check', () => {
    current = access(['approval.check'], 7);
    const { unmount } = render(<PendingRequests items={[request]} onDecided={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText(/different admin who holds approval.check/)).toBeTruthy();
    unmount();
    current = access([], 8);
    render(<PendingRequests items={[request]} onDecided={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('declining needs a note, and approving posts to the approvals API', async () => {
    current = access(['approval.check'], 8);
    post.mockResolvedValue({ status: 'executed' });
    const onDecided = vi.fn();
    render(<PendingRequests items={[request]} onDecided={onDecided} />);

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Say why/);
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/approvals/admin/requests/9/approve/', { reason: 'Approved' });
    expect(onDecided.mock.calls[0][0].text).toMatch(/Approved and applied/);
  });

  it('says so when an approved request could not be applied', async () => {
    current = access(['approval.check'], 8);
    post.mockResolvedValue({ status: 'failed', error: 'XX-AA-BBB is not ready to go live now: zone.' });
    const onDecided = vi.fn();
    render(<PendingRequests items={[request]} onDecided={onDecided} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
    expect(onDecided.mock.calls[0][0].text).toMatch(/could not be applied: .*not ready/);
  });

  it('renders nothing when there is nothing waiting', () => {
    current = access(['approval.check'], 8);
    const { container } = render(<PendingRequests items={[]} onDecided={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('the banner after a write', () => {
  it('says "sent for approval" for a 202 and the plain message otherwise', () => {
    expect(outcomeNotice({ state: 'pending_approval', approval_request: { id: 4 } }, 'Done.').kind).toBe('pending');
    expect(outcomeNotice({ state: 'pending_approval', approval_request: { id: 4 } }, 'Done.').text).toMatch(/request #4/);
    expect(outcomeNotice({ state: 'applied' }, 'The flag was changed.')).toEqual({ text: 'The flag was changed.', kind: 'done' });
  });
});
