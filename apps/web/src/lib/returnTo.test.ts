/**
 * `safeReturnTo` (AUDIT 27.78, M2/M3): only a same-origin path is followed
 * after sign-in. The tab and %09 variants passed the old prefix check and
 * navigated off-site, because browsers strip tab/newline/CR from URLs.
 */
import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './returnTo';

const FALLBACK = '/dashboard';

describe('safeReturnTo', () => {
  it.each([
    ['https://evil.example/login'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['/%09/evil.example'],
    ['/\t/evil.example'],
    ['/\n/evil.example'],
    ['/\r/evil.example'],
    ['/%0a/evil.example'],
    ['/%0d/evil.example'],
    ['%2F%2Fevil.example'],
    ['/%5Cevil.example'],
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['data:text/html,hi'],
    ['evil.example'],
    ['/trips/%E0%A4%A'],
  ])('refuses %j', (value) => {
    expect(safeReturnTo(value, FALLBACK)).toBe(FALLBACK);
  });

  it('follows an ordinary console path with its query and fragment', () => {
    expect(safeReturnTo('/trips/1?x=1#y', FALLBACK)).toBe('/trips/1?x=1#y');
  });

  it('follows an encoded path too', () => {
    expect(safeReturnTo(encodeURIComponent('/drivers/7?tab=docs'), FALLBACK)).toBe('/drivers/7?tab=docs');
  });

  it('falls back when nothing is given', () => {
    expect(safeReturnTo(null, FALLBACK)).toBe(FALLBACK);
    expect(safeReturnTo('', FALLBACK)).toBe(FALLBACK);
  });
});
