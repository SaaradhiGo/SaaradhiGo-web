import { describe, expect, it } from 'vitest';
import { csvCell, fetchAllPages, parseRef, toCsv, todayIn, withParam } from './listViews';

describe('todayIn', () => {
  it('is the city’s own day, not the browser’s', () => {
    // 20:00 UTC on 2 Nov is already 3 Nov in India and still 2 Nov in Texas.
    const now = new Date('2026-11-02T20:00:00Z');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-11-03');
    expect(todayIn('America/Chicago', now)).toBe('2026-11-02');
    expect(todayIn(undefined, now)).toBe('2026-11-02');
  });
});

describe('parseRef', () => {
  it('reads the readable ID in the ways an operator types it', () => {
    expect(parseRef('T-881230', 'T')).toBe(881230);
    expect(parseRef(' t881230 ', 'T')).toBe(881230);
    expect(parseRef('#12', 'R')).toBe(12);
    expect(parseRef('12', 'D')).toBe(12);
  });
  it('refuses another prefix or anything that is not an ID', () => {
    expect(parseRef('D-12', 'T')).toBeNull();
    expect(parseRef('+91 98765', 'T')).toBeNull();
    expect(parseRef('Ravi', 'R')).toBeNull();
  });
});

describe('CSV', () => {
  it('quotes what needs quoting and defuses spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('+91••••3210')).toBe("'+91••••3210");
    expect(csvCell(null)).toBe('');
    expect(toCsv(['A', 'B'], [[1, 'x']])).toBe('A,B\r\n1,x\r\n');
  });
});

describe('withParam', () => {
  it('sets, replaces and removes one parameter', () => {
    expect(withParam('/x/?a=1&page_size=50', 'page_size', '1')).toBe('/x/?a=1&page_size=1');
    expect(withParam('/x/', 'page_size', '1')).toBe('/x/?page_size=1');
    expect(withParam('/x/?a=1', 'a', '')).toBe('/x/');
  });
});

describe('fetchAllPages', () => {
  it('pages through the server until the last page', async () => {
    const asked: string[] = [];
    const get = async <R,>(path: string): Promise<R> => {
      asked.push(path);
      const page = Number(new URLSearchParams(path.split('?')[1]).get('page'));
      return { count: 5, total_pages: 3, results: page <= 2 ? [page * 10, page * 10 + 1] : [30] } as R;
    };
    const out = await fetchAllPages<number>((p, size) => `/l/?page=${p}&page_size=${size}`, { pageSize: 2, get });
    expect(out).toEqual({ rows: [10, 11, 20, 21, 30], total: 5, truncated: false });
    expect(asked).toHaveLength(3);
  });

  it('stops at the cap and says the export was cut short', async () => {
    const get = async <R,>(): Promise<R> => ({ count: 1000, results: [1, 2, 3, 4] } as R);
    const out = await fetchAllPages<number>((p) => `/l/?page=${p}`, { cap: 6, pageSize: 4, get });
    expect(out.rows).toHaveLength(6);
    expect(out.truncated).toBe(true);
  });
});
