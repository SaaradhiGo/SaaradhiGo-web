import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/lib/adminScope', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/adminScope')>()), useAdminAccess: () => null,
}));

describe('new zone page', () => {
  it('has the record header, a back link and the draft tab', () => {
    render(<Page />);
    expect(screen.getAllByText('New zone').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'All zones' }).getAttribute('href')).toBe('/ops/zones');
    expect(screen.getByRole('tab', { name: 'Draft' })).toBeTruthy();
  });
});
afterEach(() => cleanup());
