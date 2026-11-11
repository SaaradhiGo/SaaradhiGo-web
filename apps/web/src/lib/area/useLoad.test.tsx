/**
 * After a save, the setup reloads in place (10 Nov v2): the data stays on screen until the new
 * data arrives, so the step does not drop to a skeleton and lose the next upload.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLoad } from './useLoad';

describe('useLoad', () => {
  it('refresh keeps the data on screen; retry clears it', async () => {
    let n = 0;
    let release: (v: number) => void = () => {};
    const { result } = renderHook(() => useLoad(() => (n++ === 0 ? Promise.resolve(1) : new Promise<number>((ok) => { release = ok; }))));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.refresh?.());
    expect(result.current.data).toBe(1);
    expect(result.current.state).toBe('ok');
    await act(async () => { release(2); });
    expect(result.current.data).toBe(2);
    act(() => result.current.retry());
    expect(result.current.data).toBeNull();
  });

  it('a request lost once is tried again quietly before any error shows (11 Nov)', async () => {
    let n = 0;
    const { result } = renderHook(() => useLoad(() => (n++ === 0 ? Promise.reject(new Error('lost')) : Promise.resolve(7))));
    await waitFor(() => expect(result.current.data).toBe(7));
    expect(result.current.state).toBe('ok');
    expect(n).toBe(2);
  });
});
