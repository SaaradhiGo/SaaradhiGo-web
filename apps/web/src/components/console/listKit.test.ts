import { describe, expect, it, vi } from 'vitest';
import { chipToneOf, pageQuery, viewsOf } from '@/components/console/listKit';
import { financeChips, paymentChipTone, savedQuery, statusViews, words } from '@/components/console/money/moneyKit';
import { EMPTY_FILTERS } from '@/lib/finance';

describe('the list glue', () => {
  it('never paints an old "bad" tone red: red is for critical only', () => {
    expect(chipToneOf('bad')).toBe('caution');
    expect(chipToneOf('wait')).toBe('info');
    expect(chipToneOf('good')).toBe('good');
    expect(chipToneOf('neutral')).toBe('neutral');
    expect(paymentChipTone('failed')).toBe('caution');
  });

  it('puts the server count on the active view only', () => {
    const views = viewsOf(['live', 'draft'] as const, (s) => s.toUpperCase(), 'draft', 7);
    expect(views.map((v) => v.key)).toEqual(['', 'live', 'draft']);
    expect(views.find((v) => v.key === 'draft')?.count).toBe(7);
    expect(views.find((v) => v.key === '')?.count).toBeUndefined();
    expect(statusViews(['completed'], '', 3)[0].count).toBe(3);
  });

  it('turns a page number into limit and offset', () => {
    expect(pageQuery(1, 25)).toEqual({ limit: '25', offset: '0' });
    expect(pageQuery(3, 25)).toEqual({ limit: '25', offset: '50' });
  });

  it('writes a status in words', () => {
    expect(words('payment_no_webhook')).toBe('Payment no webhook');
    expect(words('')).toBe('—');
  });
});

describe('the money filter chips', () => {
  it('names each filter in use and removes only that one', () => {
    const go = vi.fn();
    const filters = { ...EMPTY_FILTERS, from: '2026-10-01', to: '2026-10-07', method: 'cash', currency: 'INR', page: 3 };
    const chips = financeChips(filters, go);
    expect(chips.map((c) => c.key)).toEqual(['range', 'method', 'currency']);
    chips[1].onRemove();
    expect(go).toHaveBeenCalledWith({ ...filters, method: '', page: 1 });
  });

  it('saves a view without its page', () => {
    expect(savedQuery('status=failed&page=4')).toBe('status=failed');
  });
});
