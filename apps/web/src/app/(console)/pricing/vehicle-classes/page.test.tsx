import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/pricing/vehicle-classes' }));

const rows = [
  { id: 1, code: 'sedan', description: 'Four seats', zones_priced: 2, zones_in_scope: 2, zones: [{ id: 5, name: 'Madhapur', city: 'Hyderabad' }], zones_missing: [], active_vehicles: 7 },
  { id: 2, code: 'suv_xl', description: 'Large SUV', zones_priced: 0, zones_in_scope: 2, zones: [], zones_missing: [{ id: 9, name: 'Gachibowli' }], active_vehicles: 0 },
];
let canEdit = true;
const fetchMock = vi.fn();

beforeEach(() => {
  canEdit = true;
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({
    ok: true, status: init?.method === 'POST' ? 201 : 200,
    json: async () => ({ status: 'success', data: init?.method === 'POST' ? { id: 3 } : { results: rows, can_edit: canEdit } }),
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => cleanup());

describe('vehicle classes', () => {
  it('lists rows and flags a class priced nowhere', async () => {
    render(<Page />);
    expect(await screen.findByText('2 of 2 zones')).toBeTruthy();
    expect(screen.getByText('Not priced anywhere')).toBeTruthy();
  });

  it('posts the add form and hides it without can_edit', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: /Add a vehicle class/ }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'Mini' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Small' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(JSON.parse(post![1].body)).toEqual({ code: 'mini', description: 'Small' });
    });
    cleanup();
    canEdit = false;
    render(<Page />);
    await screen.findByText('Large SUV');
    expect(screen.queryByRole('button', { name: /Add a vehicle class/ })).toBeNull();
  });

  it('lists zones missing a card on the Coverage tab', async () => {
    render(<Page />);
    fireEvent.click(await screen.findByText('Large SUV'));
    expect(await screen.findByText('Gachibowli')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Add a fare card for Gachibowli/ }).getAttribute('href')).toBe('/pricing/fare-cards');
  });
});
