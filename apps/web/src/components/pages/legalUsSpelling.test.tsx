/** Legal pages: US spelling for US visitors only, spelling never meaning; India keeps UK English (owner, 14 Nov). */
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { LegalDoc, type DocKind } from './LegalDoc';

vi.mock('next/navigation', () => ({
  usePathname: () => '/terms',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const KINDS: DocKind[] = ['riderTerms', 'driverTerms', 'privacy', 'refunds', 'textMessages', 'cookies',
  'deleteAccount', 'zeroTolerance', 'accessibility'];
const UK = /\b(licence|cancelled|cancelling|colour|neighbourhood|anonymised?|centre|labelled|favour|behaviour)\b/i;

function text(kind: DocKind, market: 'IN' | 'US') {
  cleanup();
  const { container } = render(
    <LocaleProvider initialLanguage="en">
      <LegalProvider initialMarket={market} decided>
        <LegalDoc kind={kind} />
      </LegalProvider>
    </LocaleProvider>,
  );
  return container.textContent ?? '';
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { cities: [] } }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('legal pages for a US visitor', () => {
  it.each(KINDS)('%s has no UK spelling left', (kind) => {
    expect(text(kind, 'US')).not.toMatch(UK);
  });

  it('respells the US rider terms (canceled)', () => {
    const us = text('riderTerms', 'US');
    expect(us).toContain('canceled');
    expect(us.length).toBeGreaterThan(1000);
  });
});

describe('legal pages for an India visitor', () => {
  it('keep UK English', () => {
    const all = KINDS.map((k) => text(k, 'IN')).join(' ');
    expect(all).toMatch(/\bCancelling\b|\bcancelled\b|\blicence\b/);
    expect(all).not.toMatch(/\bcanceled\b|\bCanceling\b/);
  });
});
