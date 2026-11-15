/**
 * Owner, 14 Nov: after sign-out the browser still held saaradhi_rider_user (name, phone, id) and
 * saaradhi_admin_user. No personal data is kept in browser storage at all: the account lives in
 * memory for the page and is read again from the session; old copies go on the next visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PERSONAL = /Ana Rider|\+91\s?98|"id":\s?7|ops@example|Op Erator/;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/session')) return new Response(JSON.stringify({ role: 'rider', roles: ['rider'] }), { status: 200 });
    const user = String(url).includes('admin') ? { id: 9, full_name: 'Op Erator', email: 'ops@example.test' }
      : { id: 7, full_name: 'Ana Rider', phone_number: '+919800000001', role: 'rider' };
    return new Response(JSON.stringify({ data: { session: true, user } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); document.cookie = 'sg-rider-in=; path=/; max-age=0'; });

function storageText() {
  const all: string[] = [];
  for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i += 1) { const k = s.key(i)!; all.push(`${k}=${s.getItem(k)}`); }
  return all.join('\n');
}

describe('personal data in browser storage', () => {
  it('a rider signing in and out leaves none, and the name is gone after sign-out', async () => {
    const pa = await import('@/lib/publicAuth');
    await pa.signInWithEmail('ana@example.test', 'pass-word-1', 'rider');
    expect(pa.readSessionUser()?.full_name).toBe('Ana Rider');   // in memory, for this page
    expect(storageText()).not.toMatch(PERSONAL);
    // 15 Nov: a planned trip (pickup and drop addresses) is kept in this tab until sign-out.
    const { saveDraft } = await import('@/lib/area/rider');
    const place = (label: string) => ({ lat: 43.6, lng: -116.2, label });
    saveDraft({ from: place('1200 W Main St, Boise'), to: place('Boise Airport') });
    sessionStorage.setItem('sg-other', 'kept');
    expect(storageText()).toMatch(/sg-ride-draft:/);
    pa.clearRiderTokens();
    expect(pa.readSessionUser()).toBeNull();
    expect(storageText()).not.toMatch(PERSONAL);
    expect(storageText()).not.toMatch(/sg-ride-draft:|Main St|Boise Airport/);
    expect(sessionStorage.getItem('sg-other')).toBe('kept');
  });

  it('an operator signing in and out leaves none', async () => {
    const api = await import('@/lib/api');
    await api.adminLoginWithPassword('ops@example.test', 'pass-word-1');
    expect(api.readOperator()?.full_name).toBe('Op Erator');
    expect(storageText()).not.toMatch(PERSONAL);
    await api.signOutConsole();
    expect(api.readOperator()).toBeNull();
    expect(storageText()).not.toMatch(PERSONAL);
  });

  it('copies saved by older versions are deleted on the next visit', async () => {
    localStorage.setItem('saaradhi_rider_user', JSON.stringify({ id: 7, full_name: 'Ana Rider', phone_number: '+919800000001' }));
    localStorage.setItem('saaradhi_admin_user', JSON.stringify({ full_name: 'Op Erator', email: 'ops@example.test' }));
    await import('@/lib/api');
    expect(localStorage.getItem('saaradhi_rider_user')).toBeNull();
    expect(localStorage.getItem('saaradhi_admin_user')).toBeNull();
  });
});
