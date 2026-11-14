/**
 * QA, 14 Nov: with real Stripe test keys the card hold remounted Stripe's form on every render
 * (247 frames) and the card fields never settled. The form is mounted once per hold and destroyed
 * when the sheet closes.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import { CardHoldSheet } from './CardHoldSheet';

afterEach(() => { cleanup(); delete (window as unknown as { Stripe?: unknown }).Stripe; });

describe('the card hold form', () => {
  it('mounts once across re-renders and is destroyed on close', async () => {
    const mount = vi.fn();
    const destroy = vi.fn();
    const create = vi.fn(() => ({ mount, destroy }));
    (window as unknown as { Stripe: unknown }).Stripe = () => ({ elements: () => ({ create }), confirmPayment: vi.fn() });
    const setup = { clientSecret: 'pi_x_secret_y', publishableKey: 'pk_test_x', amount: '29.29', currency: 'USD' };
    const ui = (n: number) => (
      <LocaleProvider initialLanguage="en">
        <LegalProvider initialMarket="US" decided>
          <CardHoldSheet key="hold" setup={{ ...setup }} onDone={() => n} />
        </LegalProvider>
      </LocaleProvider>
    );
    const { rerender, unmount } = render(ui(0));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    for (let i = 1; i < 6; i += 1) {
      rerender(ui(i));
      await act(async () => { await Promise.resolve(); });
    }
    expect(create).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
