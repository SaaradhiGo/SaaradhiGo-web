/** 17 Nov (PROD round 2): public pages are listed and crawlable; the console and signed-in areas are not. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/support', () => ({ IS_PUBLIC_SITE: true, SITE_URL: 'https://www.saaradhigo.com' }));

import robots from './robots';
import sitemap from './sitemap';

describe('robots and sitemap on the public site', () => {
  const rule = robots().rules as { disallow: string[] }[];
  const disallow = rule[0].disallow;

  it('disallows the console root and every private area', () => {
    for (const path of ['/ops', '/rider/', '/driver$', '/driver/earnings', '/account']) expect(disallow).toContain(path);
  });

  it('keeps the driver application crawlable and listed', () => {
    expect(disallow.some((d) => '/driver/sign-up'.startsWith(d) && !d.endsWith('$'))).toBe(false);
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain('https://www.saaradhigo.com/driver/sign-up');
    expect(urls).toContain('https://www.saaradhigo.com/zero-tolerance');
    expect(urls).toContain('https://www.saaradhigo.com/accessibility');
    expect(urls.some((u) => u.includes('/ops'))).toBe(false);
  });
});
