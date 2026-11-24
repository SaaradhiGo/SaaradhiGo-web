import { describe, expect, it } from 'vitest';
import { ancestry, childrenOf, isLaunched } from '@/components/console/shell/PlaceBar';
import { marketName, placeName } from '@/lib/places';
import { keyWords, providerName, templateName } from '@/lib/templateNames';
import { notLaunchedCodes } from '@/lib/notLaunched';
import { stamp } from '@/lib/consoleTime';
import type { AdminScope } from '@/lib/adminScope';

const S = (code: string, name: string, kind: string, depth: number, status = 'active'): AdminScope =>
  ({ code, name, kind, depth, status,
    path: code === 'GLOBAL' ? 'GLOBAL/' : `GLOBAL/${code.split('-').map((_, i, a) => a.slice(0, i + 1).join('-')).join('/')}/` });
const scopes = [S('GLOBAL', 'Global', 'global', 0), S('IN', 'India', 'country', 1), S('US', 'United States', 'country', 1),
  S('IN-TG', 'Telangana', 'state', 2), S('IN-TG-HYD', 'Hyderabad', 'city', 3), S('IN-TG-WGL', 'Warangal', 'city', 3, 'draft')];

describe('console final pass (owner 24 Nov)', () => {
  it('walks the place path and its next level', () => {
    expect(ancestry(scopes, scopes[4]).map((s) => s.name)).toEqual(['India', 'Telangana', 'Hyderabad']);
    expect(childrenOf(scopes, scopes[0]).map((s) => s.code)).toEqual(['IN', 'US']);
    expect(childrenOf(scopes, scopes[3]).map((s) => s.code)).toEqual(['IN-TG-HYD', 'IN-TG-WGL']);
    expect(isLaunched(scopes[5])).toBe(false);
    expect([...notLaunchedCodes(scopes)]).toEqual(['IN-TG-WGL']);
  });
  it('names places, never codes', () => {
    expect(placeName('IN-TG-HYD', scopes)).toBe('Hyderabad');
    expect(placeName('US', [])).toBe('United States');
    expect(marketName('IN', 'TG')).toBe('Telangana, India');
    expect(marketName('US', '')).toBe('All of United States');
  });
  it('writes system keys as words', () => {
    expect(templateName('commission.increase_notice')).toBe('Driver fee increase notice');
    expect(templateName('payout.something_new')).toBe('Payout something new');
    expect(providerName('in_app')).toBe('In-app inbox');
    expect(keyWords('rider_platform_fee')).toBe('Rider platform fee');
  });
  it('stamps every record one way', () => {
    expect(stamp('2026-11-16T16:07:00Z', 'Asia/Kolkata')).toBe('16 Nov 2026, 9:37 PM IST');
  });
});
