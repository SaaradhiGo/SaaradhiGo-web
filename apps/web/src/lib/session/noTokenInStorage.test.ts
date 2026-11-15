/**
 * Owner, 14 Nov: no login key is ever written to localStorage or sessionStorage, where any script on
 * the page could read it. Every sign-in and session path is driven here with a backend that answers
 * the way the session proxy does, and every storage write is watched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminLoginWithPassword, api, loginWithOtp, signOutConsole } from '@/lib/api';
import { areaGet } from '@/lib/area/api';
import { registerRider, signInWithEmail, verifyPublicOtp, clearRiderTokens } from '@/lib/publicAuth';

const JWTISH = /eyJ[\w-]+\.[\w-]+|[\w-]{20,}\.[\w-]{20,}\.[\w-]+/;
const writes: Array<{ key: string; value: string }> = [];

beforeEach(() => {
  writes.length = 0;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    writes.push({ key, value: String(value) });
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.startsWith('/api/session')) return new Response(JSON.stringify({ role: 'rider', roles: ['rider'] }), { status: 200 });
    // The session proxy's answer to a sign-in: the tokens are cookies; the body says session: true.
    return new Response(JSON.stringify({ status: 'success', data: { session: true, user: { id: 7, full_name: 'Ana Rider', role: 'rider' } } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function noTokenWritten() {
  for (const w of writes) {
    expect(w.key).not.toMatch(/token/i);
    expect(w.value).not.toMatch(JWTISH);
  }
}

describe('no token in browser storage', () => {
  it('rider sign-in by email, by phone code, and a new rider account', async () => {
    await signInWithEmail('ana@example.test', 'pass-word-1', 'rider');
    await verifyPublicOtp('+919999999999', '123456', 'rider');
    await registerRider({ fullName: 'Ana', email: 'ana@example.test', password: 'pass-word-1' });
    noTokenWritten();
    // 14 Nov: not even a display copy of the account is stored.
    expect(writes.map((w) => w.key)).not.toContain('saaradhi_rider_user');
  });

  it('console sign-in by password and by phone code', async () => {
    await adminLoginWithPassword('ops@example.test', 'pass-word-1');
    await loginWithOtp('+919999999999', '123456');
    noTokenWritten();
  });

  it('signed-in calls and signing out', async () => {
    document.cookie = 'sg-rider-in=1; path=/';
    document.cookie = 'sg-staff-in=1; path=/';
    await areaGet('/auth/profile/');
    await api.get('/admin/kyc/');
    await signOutConsole();
    clearRiderTokens();
    noTokenWritten();
  });

  it('sessionStorage too', async () => {
    await signInWithEmail('ana@example.test', 'pass-word-1', 'rider');
    expect(writes.filter((w) => w.key.toLowerCase().includes('token'))).toEqual([]);
  });
});
