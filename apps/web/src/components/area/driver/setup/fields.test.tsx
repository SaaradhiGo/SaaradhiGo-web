/** The setup saves one thing at a time (10 Nov v2): a second save starts when the first is done. */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { useSaveState } from './fields';

describe('useSaveState', () => {
  it('runs saves in order, one at a time', async () => {
    const { result } = renderHook(() => useSaveState(), { wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider> });
    const log: string[] = [];
    let release: () => void = () => {};
    await act(async () => {
      void result.current.run(() => new Promise<void>((ok) => { log.push('a start'); release = () => { log.push('a end'); ok(); }; }));
      void result.current.run(async () => { log.push('b start'); });
      await Promise.resolve();
    });
    expect(log).toEqual(['a start']);
    expect(result.current.state.saving).toBe(2);
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(log).toEqual(['a start', 'a end', 'b start']);
    expect(result.current.state.saving).toBe(0);
  });
});
