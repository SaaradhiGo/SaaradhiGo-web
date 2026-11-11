/**
 * The data hooks: loading -> ready, a server error -> error with a working
 * reload, a 403 -> forbidden (and no retry), and the request that leaves
 * the browser names the window and the city.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAlerts, useOverview } from './useCommandCentre';

type Reply = { status: number; body: unknown };

function server(handler: (url: string) => Reply) {
  const fetchMock = vi.fn(async (url: string) => {
    const r = handler(url);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const overview = { window: '24h', generated_at: 'x', scope: null, money_visible: true, definitions: {}, cities: [] };

afterEach(() => vi.unstubAllGlobals());

describe('useOverview', () => {
  it('loads, then is ready, and asks for the window and the city', async () => {
    const fetchMock = server(() => ({ status: 200, body: { status: 'success', data: overview } }));
    const { result } = renderHook(() => useOverview('24h', 'IN-TG-HYD', 0));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.window).toBe('24h');
    const url = String((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain('/command-centre/admin/overview/?window=24h&scope=IN-TG-HYD');
  });

  it('reports a server error with its message and reloads on demand', async () => {
    let calls = 0;
    server(() => {
      calls += 1;
      return calls === 1
        ? { status: 500, body: { error: { code: 'BOOM', message: 'The database is away.' } } }
        : { status: 200, body: { status: 'success', data: overview } };
    });
    const { result } = renderHook(() => useOverview('today', null, 0));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('The database is away.');
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBeNull();
  });

  it('uses a plain sentence when the failure has no server message', async () => {
    server(() => ({ status: 502, body: null }));
    const { result } = renderHook(() => useOverview('today', null, 0));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('We could not load the figures.');
  });

  it('is forbidden on a 403 and keeps no data', async () => {
    server(() => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'No.' } } }));
    const { result } = renderHook(() => useOverview('7d', null, 0));
    await waitFor(() => expect(result.current.status).toBe('forbidden'));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('refetches when the window or the city changes', async () => {
    const fetchMock = server(() => ({ status: 200, body: { status: 'success', data: overview } }));
    const { result, rerender } = renderHook(
      ({ w, c }: { w: 'today' | '24h' | '7d'; c: string | null }) => useOverview(w, c, 0),
      { initialProps: { w: 'today', c: null } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ w: '7d', c: 'US-TX-AUS' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String((fetchMock.mock.calls[1] as unknown as [string])[0])).toContain('window=7d&scope=US-TX-AUS');
  });
});

describe('useAlerts', () => {
  it('loads the open alerts for a city', async () => {
    const page = { count: 1, open_count: 1, limit: 50, offset: 0, results: [] };
    const fetchMock = server(() => ({ status: 200, body: { status: 'success', data: page } }));
    const { result } = renderHook(() => useAlerts('IN-TG-HYD', 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data?.open_count).toBe(1);
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toContain('/command-centre/admin/alerts/?open=1&limit=50&city=IN-TG-HYD');
  });

  it('is forbidden on a 403', async () => {
    server(() => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'No.' } } }));
    const { result } = renderHook(() => useAlerts(null, 0));
    await waitFor(() => expect(result.current.status).toBe('forbidden'));
  });
});
