import { describe, expect, it } from 'vitest';
import { adminHostDecision, isRoutedPath } from './adminHost';

describe('admin.saaradhigo.com (20 Nov)', () => {
  it('opens the console at the root and keeps console, BFF and asset paths', () => {
    expect(adminHostDecision('admin.saaradhigo.com', '/', '')).toEqual({ kind: 'redirect', to: '/ops' });
    expect(adminHostDecision('admin.saaradhigo.com', '/login', '?next=/ops')).toEqual({ kind: 'redirect', to: '/ops/login?next=/ops' });
    expect(adminHostDecision('admin.saaradhigo.com', '/ops/login', '')).toEqual({ kind: 'next' });
    expect(adminHostDecision('admin.saaradhigo.com', '/api/staff', '?to=/auth/admin/login/')).toEqual({ kind: 'next' });
    expect(adminHostDecision('admin.saaradhigo.com', '/brand/emblem-gold.svg', '')).toEqual({ kind: 'next' });
  });

  it('sends public pages to www', () => {
    expect(adminHostDecision('admin.saaradhigo.com', '/privacy', '')).toEqual({ kind: 'redirect', to: 'https://www.saaradhigo.com/privacy' });
    expect(adminHostDecision('ADMIN.saaradhigo.com:443', '/ride', '?d=1')).toEqual({ kind: 'redirect', to: 'https://www.saaradhigo.com/ride?d=1' });
  });

  it('leaves every other host to the area routing', () => {
    expect(adminHostDecision('www.saaradhigo.com', '/', '')).toBeNull();
    expect(adminHostDecision(null, '/ops', '')).toBeNull();
  });

  it('routes only the paths the old matcher listed', () => {
    for (const p of ['/ride', '/ride/choose', '/driver/sign-in', '/sign-in', '/account', '/login', '/zones/x']) expect(isRoutedPath(p)).toBe(true);
    for (const p of ['/', '/privacy', '/ops', '/ops/login', '/safety', '/rides']) expect(isRoutedPath(p)).toBe(false);
  });
});
