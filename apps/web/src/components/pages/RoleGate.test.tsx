/** The role gate says which role a page needs (13 Nov): from the props the server reads from the rewrite. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
const roles = vi.hoisted(() => ({ value: { role: 'rider', roles: ['rider'] } as { role: string; roles: string[] } | null }));
vi.mock('@/lib/publicAuth', () => ({
  sessionRoles: async () => roles.value, switchRole: vi.fn(), establishServerSession: vi.fn(), readRiderToken: () => 't',
}));
vi.mock('@/lib/area/api', () => ({ areaPost: vi.fn() }));

import { LocaleProvider } from '@/i18n/LocaleProvider';
import { RoleGate as Gate, safeNext } from './RoleGate';

const RoleGate = (p: { need: 'rider' | 'driver'; next: string | null }) => <LocaleProvider><Gate {...p} /></LocaleProvider>;

describe('the role gate', () => {
  it('a rider on a driver page is told it is for driving and offered Apply to drive', async () => {
    roles.value = { role: 'rider', roles: ['rider'] };
    render(<RoleGate need="driver" next="/driver/earnings" />);
    expect(await screen.findByText("You don't drive with SaaradhiGo yet")).toBeTruthy();
    expect(screen.getByText('Apply to drive').getAttribute('href')).toBe('/drive');
    expect(screen.getByTestId('role-gate').dataset.need).toBe('driver');
  });
  it('a rider who also drives is offered Switch to driving', async () => {
    roles.value = { role: 'rider', roles: ['rider', 'driver'] };
    render(<RoleGate need="driver" next="/driver" />);
    expect(await screen.findByText('This page is for driving')).toBeTruthy();
    expect(screen.getByTestId('gate-switch').textContent).toBe('Switch to driving');
  });
  it('a driver with no rider role gets Ride with your SaaradhiGo account', async () => {
    roles.value = { role: 'driver', roles: ['driver'] };
    render(<RoleGate need="rider" next="/ride/choose" />);
    expect(await screen.findByText('Ride with your SaaradhiGo account')).toBeTruthy();
    expect(screen.getByText('Back to driver home').getAttribute('href')).toBe('/driver');
  });
  it('never continues to another site', () => {
    expect(safeNext('//evil.example', 'rider')).toBe('/ride/choose');
    expect(safeNext('https://evil.example', 'driver')).toBe('/driver');
    expect(safeNext('/trips/207', 'rider')).toBe('/trips/207');
  });
});
