import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Page from './page';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  const access = {
    id: 1, email: 'ops@example.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
    permissions: ['liveops.read', 'safety.respond', 'drivers.read'], roles: [], scopes: [], access_model: 'scoped',
  };
  return { ...actual, useAdminAccess: () => access, getCachedAccess: () => access };
});
vi.mock('@/lib/useLiveOps', () => {
  const city = (code: string, online: number, onTrip: number, waiting: number, stale: number) => ({
    code, name: 'City', network_status: 'NORMAL', online_drivers: online, on_trip_drivers: onTrip,
    unassigned_trips: waiting, oldest_unassigned_age_s: null, stale_trips: stale,
  });
  const cities = [city('C', 3, 2, 1, 1), city('D', 4, 0, 0, 0)];
  const snapshot = {
    generated_at: 'x', mode: 'full', city: null, poll_seconds: 10, presence_available: true, cities,
    zones: [{ code: 'Z', name: 'Zone', type: 'city', city: 'C', rings: [[[17, 78], [17, 78.1], [17.1, 78.1], [17.1, 78]]] }],
    trips: [], alerts: [{
      id: 1, kind: 'sos', severity: 'critical', title: 'Rider pressed SOS', city: 'C', created_at: '2026-11-05T09:00:00Z',
      is_sos: true, lat: 17.05, lng: 78.05, sos_id: 11, sos_status: 'open', incident_id: 5,
      ack_due_at: new Date(Date.now() + 90_000).toISOString(),
    }],
  };
  const live = {
    status: 'ready', error: null, snapshot, dots: new Map(), cities, link: 'live', dataAge: 2, reload: () => undefined,
  };
  const heat = {
    data: {
      cells: [{ row: 1, col: 1, cell_south: 17, cell_west: 78, demand: 5, supply: 1, peak_supply: 1, demand_per_baseline: 5, shade: 'short', events: 5 }],
      k_anonymity: null, suppressed_cells: 0,
    },
    status: 'ready', error: null,
  };
  return { useLiveOps: () => live, useHeatmap: () => heat };
});

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); document.title = ''; });

describe('Live map workspace', () => {
  it('shows the KPI sums', () => {
    render(<Page />);
    const chip = (name: RegExp) => screen.getByRole('button', { name }).textContent;
    expect(chip(/Online/)).toBe('7Online');
    expect(chip(/On a trip/)).toBe('2On a trip');
    expect(chip(/Open SOS/)).toBe('1Open SOS');
    expect(chip(/Areas short/)).toBe('1Areas short of drivers');
  });

  it('opens the panel from the queue, shows Acknowledge, and closes on Escape', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: /SOS-11/ }));
    const panel = screen.getByRole('dialog');
    expect(panel.textContent).toContain('SOS-11');
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open case' }).getAttribute('href')).toBe('/safety-ops/incidents/5');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters the queue from a chip and collapses to a rail that is remembered', () => {
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: /Areas short/ }));
    expect(screen.queryByRole('button', { name: /SOS-11/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the needs attention queue' }));
    expect(screen.getByRole('button', { name: 'Show the needs attention queue' })).toBeTruthy();
    expect(window.localStorage.getItem('lo-queue-collapsed')).toBe('1');
  });
});
