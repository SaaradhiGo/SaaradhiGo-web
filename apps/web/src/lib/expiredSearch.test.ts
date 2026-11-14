/**
 * Owner, 14 Nov: with an expired rider login, /ride/maps/geocode returned 401, the suggestions
 * stayed empty with no message, and the header kept the old name. Now the session server renews
 * once; when it cannot, it answers the search as a guest and says the session ended, and the page
 * drops the stale name so the header shows "Log in".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPlaces } from './booking';
import { RIDER_USER_KEY, SESSION_EVENT, readRiderToken } from './publicAuth';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.cookie = 'sg-rider-in=; path=/; max-age=0';
});

describe('place search with an expired login', () => {
  it('still answers, and the stale session is gone', async () => {
    document.cookie = 'sg-rider-in=1; path=/';
    localStorage.setItem(RIDER_USER_KEY, JSON.stringify({ full_name: 'Old Name', role: 'rider' }));
    const announced = vi.fn();
    window.addEventListener(SESSION_EVENT, announced);
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ data: { predictions: [{ description: 'Boise State University', place_id: 'b' }] } }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'x-sg-session': 'ended' },
      });
    }));

    const places = await searchPlaces('Boise State', null, 'pickup', null, 'US');

    expect(places.map((p) => p.description)).toEqual(['Boise State University']);
    expect(urls[0]).toBe('/api/rider?to=/ride/maps/geocode');
    expect(readRiderToken()).toBeNull();                       // "Log in" in the header
    expect(localStorage.getItem(RIDER_USER_KEY)).toBeNull();   // no stale name
    expect(announced).toHaveBeenCalled();
    window.removeEventListener(SESSION_EVENT, announced);
  });

  it('signed out, the search goes straight to the API with no Authorization header', async () => {
    const seen: Array<{ url: string; auth?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), auth: (init.headers as Record<string, string>).Authorization });
      return new Response(JSON.stringify({ data: { predictions: [] } }), { status: 200 });
    }));
    await searchPlaces('Boise State', null, 'pickup', null, 'US');
    expect(seen[0].url).toMatch(/\/ride\/maps\/geocode$/);
    expect(seen[0].url.startsWith('/api/')).toBe(false);
    expect(seen[0].auth).toBeUndefined();
  });
});
