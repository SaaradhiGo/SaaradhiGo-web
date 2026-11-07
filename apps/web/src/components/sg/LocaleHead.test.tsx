/**
 * LocaleHead translates the title and og:locale, and settles: its first
 * version rewrote og:locale on every head mutation, its own writes included,
 * and froze every public page in an endless loop.
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LocaleHead } from './LocaleHead';

describe('LocaleHead', () => {
  it('translates the title and og:locale, then stops writing', async () => {
    localStorage.setItem('sg-language', 'te');
    document.title = 'Help — SaaradhiGo';
    const og = document.createElement('meta');
    og.setAttribute('property', 'og:locale');
    og.setAttribute('content', 'en_IN');
    document.head.appendChild(og);

    let writes = 0;
    const count = new MutationObserver((records) => { writes += records.length; });
    count.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true });

    render(<LocaleProvider><LocaleHead /></LocaleProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(document.title).toBe('సహాయం — SaaradhiGo');
    expect(og.getAttribute('content')).toBe('te_IN');
    const settled = writes;
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(writes).toBe(settled);
    expect(writes).toBeLessThan(10);
    count.disconnect();
    localStorage.removeItem('sg-language');
  });
});
