import { describe, expect, it } from 'vitest';
import type { AdminAccess, AdminScope } from './adminScope';
import { commandsFor, parseRef } from './commands';
import { landingFor } from './landing';
import { againstUsual, waited } from './workspace';
import { freshnessText } from '@/components/console/shell/Freshness';
import { matchPlaces } from '@/components/console/shell/PlacePicker';

const access = (roles: string[], permissions: string[]): AdminAccess => ({
  id: 7, email: 'x@saaradhigo.test', full_name: 'X', is_superuser: false, is_break_glass: false,
  permissions, roles: roles.map((role) => ({ role, role_name: role, scope: 'IN', scope_name: 'India', scope_kind: 'country' })),
  scopes: [], access_model: 'scoped',
} as unknown as AdminAccess);

describe('Ctrl K', () => {
  it('reads every readable ID', () => {
    expect(parseRef('SOS-1042')?.spec.href(1042)).toBe('/ops/safety-ops/incidents/1042');
    expect(parseRef('t 881230')?.spec.href(881230)).toBe('/ops/trips/881230');
    expect(parseRef('APR-5')?.spec.href(5)).toBe('/ops/approvals?id=5');
    expect(parseRef('Hyderabad')).toBeNull();
  });
  it('offers only what the operator can open', () => {
    const safety = access(['safety_officer'], ['safety.respond', 'trip.read']);
    expect(commandsFor('SOS-9', safety).map((c) => c.href)).toEqual(['/ops/safety-ops/incidents/9']);
    expect(commandsFor('APR-5', safety)).toEqual([]);
    expect(commandsFor('appro', safety)).toEqual([]);
    const finance = access(['finance'], ['finance.read', 'finance.payout']);
    expect(commandsFor('appro', finance).map((c) => c.href)).toEqual(['/ops/approvals']);
  });
});

describe('role landing', () => {
  it('sends each role to its own place', () => {
    expect(landingFor(access(['safety_officer'], ['safety.respond', 'trip.read']))).toBe('/ops/safety-ops');
    expect(landingFor(access(['kyc_verifier'], ['driver.read']))).toBe('/ops/kyc');
    expect(landingFor(access(['finance'], ['finance.read', 'report.read']))).toBe('/ops/finance');
    expect(landingFor(access(['analyst'], ['report.read']))).toBe('/ops/reports');
    expect(landingFor(access(['city_ops_manager'], ['trip.read', 'report.read']))).toBe('/ops/dashboard');
  });
});

describe('place picker', () => {
  const s = (code: string, name: string, kind: string): AdminScope => ({ code, name, kind, status: 'active', depth: 1 });
  const scopes = [s('IN', 'India', 'country'), s('IN-TG-HYD', 'Hyderabad', 'city'), s('US-TX-AUS', 'Austin', 'city')];
  it('finds "Hyd" first by name', () => {
    expect(matchPlaces(scopes, 'Hyd').map((x) => x.code)).toEqual(['IN-TG-HYD']);
    expect(matchPlaces(scopes, 'us-tx').map((x) => x.code)).toEqual(['US-TX-AUS']);
    expect(matchPlaces(scopes, '')).toEqual([]);
  });
});

describe('freshness and usual range', () => {
  it('turns stale after 90 s', () => {
    expect(freshnessText(1_000, 6_000)).toEqual({ text: 'Updated 5 s ago', stale: false });
    expect(freshnessText(0, 200_000).stale).toBe(true);
    expect(freshnessText(null, 0).text).toBe('Loading…');
  });
  it('says where a number sits, or nothing', () => {
    expect(againstUsual(81, { low: 88, high: 92, weeks: 4 }, '%')).toBe('Below usual 88%–92%');
    expect(againstUsual(81, null)).toBeNull();
    expect(waited(90)).toBe('1 min');
  });
});
