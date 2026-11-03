/**
 * Product phase 1, web live trip (PRODUCT_AUDIT §2, owner decision D4).
 *
 * The web live trip had no Share trip and no SOS, and the spec requires both
 * on every live-trip screen. SOS is hold-to-send: 2 seconds, sent at once,
 * then "Tap if this was a mistake". These pin that a click sends nothing, a
 * full hold sends once, the mistake goes to the raiser's own path, and the
 * driver card never carries the phone number the accept frame includes.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RIDER_TOKEN_KEY } from '@/lib/publicAuth';
import { driverFromInfo } from '@/lib/booking';
import { shareTripText } from '@/lib/tripSafety';
import { TripSafety } from './TripSafety';

type Call = { url: string; method: string; body: unknown };

let calls: Call[];

function respond(url: string) {
  if (url.includes('/app-config/')) {
    return {
      country: {
        emergency: { numbers: [{ kind: 'unified', number: '112' }], label: 'Emergency services' },
        support: { phone: null },
      },
    };
  }
  if (url.endsWith('/mistake/')) return { sos_id: 12, status: 'false_alarm' };
  if (url.endsWith('/sos/')) return { sos_id: 12, status: 'open' };
  return {};
}

beforeEach(() => {
  calls = [];
  window.localStorage.setItem(RIDER_TOKEN_KEY, 'test-token');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ status: 'success', data: respond(url) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  // Drive requestAnimationFrame from the fake clock.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

async function openSafety() {
  render(<TripSafety tripId={77} country="IN" driverName="Ravi Kumar" plate="AP16 TX 4821" />);
  fireEvent.click(screen.getByRole('button', { name: 'Safety' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

const sosPosts = () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/sos/'));

describe('Safety on the live trip', () => {
  it('shows the market emergency number, and no support row while none is set', async () => {
    await openSafety();
    expect(screen.getByRole('link', { name: /112/ }).getAttribute('href')).toBe('tel:112');
    expect(screen.queryByText(/SaaradhiGo support/)).toBeNull();
    expect(screen.queryByText(/1800/)).toBeNull();
  });

  it('a click sends nothing; letting go at 1.5 s sends nothing', async () => {
    await openSafety();
    const sos = screen.getByRole('button', { name: /Hold to send SOS/ });
    fireEvent.click(sos);
    fireEvent.pointerDown(sos);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    fireEvent.pointerUp(sos);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(sosPosts()).toHaveLength(0);
  });

  it('a full 2 s hold sends once, with the trip, then offers the mistake path', async () => {
    await openSafety();
    const sos = screen.getByRole('button', { name: /Hold to send SOS/ });
    fireEvent.pointerDown(sos);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(sosPosts()).toHaveLength(1);
    expect(sosPosts()[0].body).toMatchObject({ trip_id: 77 });
    expect(screen.getByText(/Alert sent/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tap if this was a mistake' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/sos/12/mistake/'))).toBe(true);
    expect(screen.getByText(/Marked as a mistake/)).toBeTruthy();
  });

  it('a held Space key sends too, for keyboard and switch users', async () => {
    await openSafety();
    const sos = screen.getByRole('button', { name: /Hold to send SOS/ });
    fireEvent.keyDown(sos, { key: ' ' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(sosPosts()).toHaveLength(1);
  });
});

describe('the driver card and the share text', () => {
  it('takes name and plate from the accept frame, never the phone number', () => {
    const d = driverFromInfo(
      { name: 'Ravi Kumar', phone_number: '+910000000000', stars: '4.8' },
      { vehicle_number: 'AP16 TX 4821', model: 'Dzire' },
    );
    expect(d).toEqual({ name: 'Ravi Kumar', vehicle_number: 'AP16 TX 4821' });
  });

  it('ignores the server placeholder plate', () => {
    expect(driverFromInfo({}, { vehicle_number: 'Unknown' })).toBeNull();
  });

  it('shares only facts the page has, and no invented link', () => {
    const text = shareTripText({
      tripId: 77,
      driverName: 'Ravi Kumar',
      plate: 'AP16 TX 4821',
      pickupLabel: 'Benz Circle',
      destinationLabel: null,
    });
    expect(text).toContain('Trip: #77');
    expect(text).not.toContain('http');
    expect(text).not.toContain('null');
  });
});
