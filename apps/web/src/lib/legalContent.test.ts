import { describe, expect, it } from 'vitest';
import { LEGAL_FALLBACK } from './legal';
import * as c from './legalContent';

const ctx = (market: 'IN' | 'US') => ({ market, entity: LEGAL_FALLBACK[market], supportEmail: 'support@saaradhigo.com' });
const docs = (market: 'IN' | 'US') => [c.riderTerms, c.driverTerms, c.privacy, c.textMessages, c.grievance, c.cookies]
  .map((f) => f(ctx(market))).concat([c.refunds(ctx(market), null), c.deleteAccount(ctx(market))]);

describe('policy pages (13 Nov)', () => {
  it('never show a bare path: every page link is a [label](/path) link', () => {
    for (const m of ['IN', 'US'] as const) {
      for (const d of docs(m)) {
        for (const s of d.sections) {
          for (const line of s.p.filter((x): x is string => Boolean(x))) {
            const text = c.linkParts(line).map((p) => ('text' in p ? p.text : '')).join('');
            expect(text, `${d.title}: ${line}`).not.toMatch(/(^|[\s(])\/[a-z-]+/);
          }
        }
      }
    }
  });

  it('turns the markup into links', () => {
    expect(c.linkParts('See the [privacy policy](/privacy) for how.')).toEqual([
      { text: 'See the ' }, { label: 'privacy policy', href: '/privacy' }, { text: ' for how.' }]);
    const tm = c.textMessages(ctx('IN')).sections.flatMap((s) => s.p).find((l) => typeof l === 'string' && l.includes('privacy policy'));
    expect(c.linkParts(tm as string).some((p) => 'href' in p && p.href === '/privacy')).toBe(true);
  });
});
