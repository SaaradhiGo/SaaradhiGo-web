import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alarmTitle, type LiveAlert } from '@/lib/liveOps';
import { useSosAlarm } from '@/lib/useSosAlarm';

const NOW = Date.parse('2026-11-05T10:00:00Z');
const sos = (id: number, dueInS: number, over: Partial<LiveAlert> = {}): LiveAlert => ({
  id, kind: 'sos', severity: 'critical', title: 'SOS', city: null, created_at: '2026-11-05T09:50:00Z',
  is_sos: true, lat: null, lng: null, sos_id: id, sos_status: 'open',
  ack_due_at: new Date(NOW + dueInS * 1000).toISOString(), ...over,
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); document.title = 'Live map'; });
afterEach(() => { vi.useRealTimers(); });

describe('useSosAlarm', () => {
  it('flashes the title each second and restores it when the SOS is acknowledged', () => {
    const { rerender } = renderHook(({ a }) => useSosAlarm(a), { initialProps: { a: [sos(7, 125)] } });
    expect(document.title).toBe('⚠ SOS-7 · ack in 2:05');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.title).toBe('Live map');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(document.title).toBe('⚠ SOS-7 · ack in 2:03');
    rerender({ a: [sos(7, 100, { sos_status: 'acknowledged' })] });
    expect(document.title).toBe('Live map');
  });

  it('says overdue once the deadline passes, and restores the title on unmount', () => {
    const { unmount } = renderHook(() => useSosAlarm([sos(9, -5)]));
    expect(document.title).toBe('⚠ SOS-9 overdue');
    unmount();
    expect(document.title).toBe('Live map');
  });

  it('leaves the title alone with no deadline', () => {
    renderHook(() => useSosAlarm([sos(1, 0, { ack_due_at: null })]));
    expect(document.title).toBe('Live map');
  });

  it('titles the countdown in m:ss', () => {
    expect(alarmTitle(sos(3, 59), NOW)).toBe('⚠ SOS-3 · ack in 0:59');
  });
});
