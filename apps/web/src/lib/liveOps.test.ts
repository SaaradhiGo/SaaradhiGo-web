import { describe, expect, it } from 'vitest';
import {
  FrameBuffer, ageText, applyFrame, applyFrames, cellBounds, cellKey, cellOf, cellSentence, coalesce,
  dotsFrom, dotsInCity, heatmapUrl, linkSentence, networkTone, positionText, secondsSince, shadeLevel,
  snapshotUrl, socketUrl, type Dot, type Frame, type HeatCell,
} from '@/lib/liveOps';

const dot = (id: number, over: Partial<Dot> = {}): Dot => ({
  driver_id: id, status: 'online', vehicle_class: 'sedan', lat: 17.43, lng: 78.4, heading: null,
  updated_at: '2026-10-30T10:00:00Z', trip_id: null, city: 'IN-TG-HYD', ...over,
});
const move = (id: number, lat: number, over: Partial<Dot> = {}): Frame => ({
  type: 'driver_location_update', ...dot(id, { lat, ...over }),
});

describe('frame merge', () => {
  it('initial_drivers replaces everything', () => {
    const before = dotsFrom([dot(1), dot(2)]);
    const next = applyFrame(before, { type: 'initial_drivers', drivers: [dot(3)] });
    expect([...next.keys()]).toEqual([3]);
  });

  it('a location update adds a driver and moves a known one', () => {
    let dots = dotsFrom([]);
    dots = applyFrame(dots, move(7, 17.1));
    dots = applyFrame(dots, move(7, 17.2));
    expect(dots.size).toBe(1);
    expect(dots.get(7)?.lat).toBe(17.2);
  });

  it('does not mutate the map it was given', () => {
    const before = dotsFrom([dot(1)]);
    const next = applyFrame(before, move(1, 18));
    expect(before.get(1)?.lat).toBe(17.43);
    expect(next).not.toBe(before);
  });

  it('an offline status removes the driver, and ignores one it never knew', () => {
    const before = dotsFrom([dot(1), dot(2)]);
    const gone = applyFrame(before, { type: 'driver_status_update', driver_id: 1, status: 'offline' });
    expect([...gone.keys()]).toEqual([2]);
    const same = applyFrame(before, { type: 'driver_status_update', driver_id: 99, status: 'offline' });
    expect(same).toBe(before);
  });

  it('a location frame that says offline removes the driver too', () => {
    const before = dotsFrom([dot(1)]);
    expect(applyFrame(before, move(1, 17, { status: 'offline' })).size).toBe(0);
  });

  it('keeps the on-trip status and trip id the server sent', () => {
    const next = applyFrame(dotsFrom([]), move(5, 17, { status: 'on_trip', trip_id: 42 }));
    expect(next.get(5)).toMatchObject({ status: 'on_trip', trip_id: 42 });
  });

  it('ignores frames it does not understand, returning the same map', () => {
    const before = dotsFrom([dot(1)]);
    for (const frame of [
      { type: 'hello' }, { type: 'city_status', cities: [] }, { type: 'nonsense' },
    ] as Frame[]) {
      expect(applyFrame(before, frame)).toBe(before);
    }
  });

  it('a malformed position never blanks the map', () => {
    const before = dotsFrom([dot(1)]);
    const bad = { type: 'driver_location_update', driver_id: 2, lat: 'north', lng: 5 } as unknown as Frame;
    expect(applyFrame(before, bad)).toBe(before);
    expect(dotsFrom([{ ...dot(3), lat: Number.NaN }]).size).toBe(0);
  });

  it('applies a batch in order', () => {
    const out = applyFrames(dotsFrom([]), [move(1, 1), move(2, 2), { type: 'driver_status_update', driver_id: 1, status: 'offline' }]);
    expect([...out.keys()]).toEqual([2]);
  });
});

describe('coalesce', () => {
  it('keeps only the latest position per driver', () => {
    const out = coalesce([move(1, 1), move(2, 2), move(1, 3), move(1, 4)]);
    expect(out).toHaveLength(2);
    expect((out.find((f) => (f as { driver_id: number }).driver_id === 1) as Dot).lat).toBe(4);
  });

  it('starts again at the last initial_drivers', () => {
    const out = coalesce([
      move(1, 1), { type: 'initial_drivers', drivers: [dot(9)] }, move(1, 2),
      { type: 'initial_drivers', drivers: [dot(8)] }, move(2, 5),
    ]);
    expect(out.map((f) => f.type)).toEqual(['initial_drivers', 'driver_location_update']);
    expect((out[0] as { drivers: Dot[] }).drivers[0].driver_id).toBe(8);
  });

  it('a removal after a move wins, and a move after a removal wins', () => {
    const off: Frame = { type: 'driver_status_update', driver_id: 1, status: 'offline' };
    expect(coalesce([move(1, 1), off])).toEqual([off]);
    const back = move(1, 2);
    expect(coalesce([off, back])).toEqual([back]);
  });

  it('keeps unrelated frames in place', () => {
    const status: Frame = { type: 'city_status', cities: [] };
    expect(coalesce([status, move(1, 1)])).toEqual([status, move(1, 1)]);
  });
});

describe('throttle (FrameBuffer)', () => {
  it('releases at most once per interval', () => {
    let t = 1000;
    const buf = new FrameBuffer(1000, () => t);
    buf.push(move(1, 1));
    expect(buf.take()).toHaveLength(1);          // first release is immediate
    buf.push(move(1, 2));
    t += 400;
    expect(buf.take()).toBeNull();               // too soon
    expect(buf.size).toBe(1);
    t += 700;
    expect(buf.take()).toHaveLength(1);          // interval passed
    expect(buf.take()).toBeNull();               // nothing waiting
  });

  it('holds frames that arrive while throttled, in order', () => {
    let t = 0;
    const buf = new FrameBuffer(1000, () => t);
    buf.push(move(1, 1));
    buf.take();
    buf.push(move(1, 2));
    buf.push(move(1, 3));
    t = 1500;
    const out = buf.take() as Frame[];
    expect(out.map((f) => (f as Dot).lat)).toEqual([2, 3]);
  });

  it('is bounded: past the limit the oldest frames go', () => {
    const buf = new FrameBuffer(1000, () => 0, 3);
    for (let i = 1; i <= 10; i++) buf.push(move(i, i));
    expect(buf.size).toBe(3);
    expect((buf.take() as Dot[]).map((f) => f.driver_id)).toEqual([8, 9, 10]);
  });

  it('clear drops what is waiting', () => {
    const buf = new FrameBuffer(1000, () => 0);
    buf.push(move(1, 1));
    buf.clear();
    expect(buf.take()).toBeNull();
  });
});

describe('the grid', () => {
  it('cells are a hundredth of a degree, floored', () => {
    expect(cellOf(17.4301, 78.4003)).toEqual({ row: 1743, col: 7840 });
    expect(cellOf(17.4399, 78.4099)).toEqual({ row: 1743, col: 7840 });
    expect(cellOf(17.44, 78.41)).toEqual({ row: 1744, col: 7841 });
  });

  it('floors south of the equator and west of Greenwich (same as the server)', () => {
    expect(cellOf(-33.8688, -151.2093)).toEqual({ row: -3387, col: -15121 });
    expect(cellOf(30.267, -97.743)).toEqual({ row: 3026, col: -9775 });
  });

  it('a cell has a key and bounds that contain its points', () => {
    const c = cellOf(17.4301, 78.4003);
    expect(cellKey(c)).toBe('1743:7840');
    const [s, w, n, e] = cellBounds(c);
    expect([s, w, n, e]).toEqual([17.43, 78.4, 17.44, 78.41]);
    expect(17.4301 >= s && 17.4301 < n && 78.4003 >= w && 78.4003 < e).toBe(true);
  });

  it('shades only where demand beats supply, in three steps', () => {
    const cell = (shade: 'short' | 'balanced', per: number, supply: number) =>
      ({ shade, demand_per_baseline: per, supply }) as HeatCell;
    expect(shadeLevel(cell('balanced', 9, 0))).toBe(0);
    expect(shadeLevel(cell('short', 1.2, 1))).toBe(1);
    expect(shadeLevel(cell('short', 3, 1))).toBe(2);
    expect(shadeLevel(cell('short', 6, 1))).toBe(3);
  });

  it('says a cell in words', () => {
    const c = {
      row: 1743, col: 7840, cell_south: 17.43, cell_west: 78.4, demand: 4, supply: 1, peak_supply: 1,
      demand_per_baseline: 1.5, shade: 'short', events: 5,
    } as HeatCell;
    expect(cellSentence(c, 60)).toContain('4 requests in 60 minutes');
    expect(cellSentence(c, 60)).toContain('Short.');
  });
});

describe('addresses and words', () => {
  it('builds the endpoints', () => {
    expect(snapshotUrl(null)).toBe('/live-ops/admin/snapshot/');
    expect(snapshotUrl('IN-TG-HYD')).toBe('/live-ops/admin/snapshot/?city=IN-TG-HYD');
    expect(heatmapUrl('US-TX-AUS', 60)).toBe('/live-ops/admin/heatmap/?window=60&city=US-TX-AUS');
    expect(heatmapUrl(null, 15)).toBe('/live-ops/admin/heatmap/?window=15');
  });

  it('puts only the ticket in the socket URL, on the API origin with the scheme swapped', () => {
    expect(socketUrl('/ws/admin/live-locations/', 'abc_DEF-1', 'https://api.example.test/api/v1', ''))
      .toBe('wss://api.example.test/ws/admin/live-locations/?ticket=abc_DEF-1');
    expect(socketUrl('/ws/admin/live-locations/', 't', 'http://localhost:8000/api/v1/', ''))
      .toBe('ws://localhost:8000/ws/admin/live-locations/?ticket=t');
    expect(socketUrl('/ws/x/', 't', 'http://a/api/v1', 'wss://sockets.example.test/'))
      .toBe('wss://sockets.example.test/ws/x/?ticket=t');
    expect(socketUrl('/ws/x/', 'a b&c', 'http://a/api/v1', '')).not.toContain('token');
    expect(socketUrl('/ws/x/', 'a b&c', 'http://a/api/v1', '')).toContain('ticket=a%20b%26c');
  });

  it('ages read the way an operator says them', () => {
    expect(ageText(0)).toBe('0 s');
    expect(ageText(42.9)).toBe('42 s');
    expect(ageText(60)).toBe('1 min');
    expect(ageText(7 * 60 + 5)).toBe('7 min');
    expect(ageText(2 * 3600)).toBe('2 h');
    expect(ageText(2 * 3600 + 5 * 60)).toBe('2 h 5 min');
    expect(ageText(-5)).toBe('0 s');
    expect(ageText(null)).toBe('—');
  });

  it('seconds since an instant never goes negative', () => {
    const now = Date.parse('2026-10-30T10:00:30Z');
    expect(secondsSince('2026-10-30T10:00:00Z', now)).toBe(30);
    expect(secondsSince('2026-10-30T10:01:00Z', now)).toBe(0);
    expect(secondsSince(null, now)).toBeNull();
    expect(secondsSince('garbage', now)).toBeNull();
  });

  it('network status maps to a tone, and OFFLINE is not alarming', () => {
    expect(networkTone('NORMAL')).toBe('good');
    expect(networkTone('HIGH DEMAND')).toBe('wait');
    expect(networkTone('CRITICAL')).toBe('bad');
    expect(networkTone('OFFLINE')).toBe('neutral');
  });

  it('names the connection, and how stale the data is when the socket is down', () => {
    expect(linkSentence('live', 0)).toBe('Live');
    expect(linkSentence('polling', 12.4)).toBe('Socket disconnected, showing data from 12 s ago.');
    expect(linkSentence('polling', null)).toContain('Socket disconnected');
    expect(linkSentence('denied', null)).toContain('access');
  });

  it('formats a position, and a missing one', () => {
    expect(positionText(17.430123, 78.400456)).toBe('17.4301, 78.4005');
    expect(positionText(null, 78)).toBe('—');
  });

  it('filters dots to a city', () => {
    const dots = dotsFrom([dot(1), dot(2, { city: 'US-TX-AUS' }), dot(3, { city: null })]);
    expect(dotsInCity(dots, null)).toHaveLength(3);
    expect(dotsInCity(dots, 'US-TX-AUS').map((d) => d.driver_id)).toEqual([2]);
  });
});
