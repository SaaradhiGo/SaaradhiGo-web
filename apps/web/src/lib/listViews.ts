/**
 * Small pieces every "list + record" page shares (design board B):
 *
 *   * today's date in a city's own calendar (a "today" view is the city's
 *     day, never the browser's);
 *   * reading a typed readable ID ("T-881230", "r-12", "#12");
 *   * the CSV of exactly the view on screen, built from the server's own
 *     pages when there is no export endpoint, with spreadsheet formulas
 *     defused;
 *   * the view counts: one page_size=1 call per view, reading `count`.
 */
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** YYYY-MM-DD in the given IANA zone; UTC when there is none. */
export function todayIn(timeZone: string | null | undefined, now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The number in a readable ID the operator typed: "T-881230", "t881230",
 * "#12" or "881230" for prefix T. A different prefix is not a match.
 */
export function parseRef(raw: string, prefix: string): number | null {
  const q = raw.trim().toUpperCase().replace(/\s+/g, '');
  const p = prefix.toUpperCase();
  const m = new RegExp(`^(?:${p}-?|#)?(\\d{1,12})$`).exec(q);
  return m ? Number(m[1]) : null;
}

/** One CSV cell. A leading = + - @ is prefixed so a spreadsheet never runs it. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Hand the operator a file. */
export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The most rows a client-built export will page through. */
export const EXPORT_ROW_CAP = 10_000;
export const EXPORT_PAGE_SIZE = 100;

type Paged<T> = { count: number; results: T[]; total_pages?: number };

/**
 * Every row of a view, page by page from the server, up to `cap`. The caller
 * builds the path for a page (with its filters, order and scope).
 */
export async function fetchAllPages<T>(
  pathFor: (page: number, pageSize: number) => string,
  { cap = EXPORT_ROW_CAP, pageSize = EXPORT_PAGE_SIZE, get = api.get }: {
    cap?: number; pageSize?: number; get?: <R>(path: string) => Promise<R>;
  } = {},
): Promise<{ rows: T[]; total: number; truncated: boolean }> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; rows.length < cap; page += 1) {
    const body = await get<Paged<T>>(pathFor(page, pageSize));
    total = body?.count ?? 0;
    const got = body?.results ?? [];
    rows.push(...got);
    const pages = body?.total_pages ?? Math.ceil(total / pageSize);
    if (got.length === 0 || page >= pages) break;
  }
  return { rows: rows.slice(0, cap), total, truncated: total > cap };
}

/** Replace one query parameter (or remove it with ''), keeping the rest. */
export function withParam(path: string, key: string, value: string): string {
  const [base, query = ''] = path.split('?');
  const q = new URLSearchParams(query);
  if (value) q.set(key, value); else q.delete(key);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * The count beside each saved view: the same list endpoint with that view's
 * filters and page_size=1, reading `count`. A view whose path is null has no
 * count (it is shown without one); a failed call leaves its count blank.
 */
export function useViewCounts(paths: Record<string, string | null>, reloadKey: unknown = 0): Record<string, number | null> {
  const key = JSON.stringify(paths);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let live = true;
    const entries = Object.entries(JSON.parse(key) as Record<string, string | null>);
    void Promise.all(entries.map(async ([view, path]) => {
      if (!path) return [view, null] as const;
      try {
        const body = await api.get<{ count?: number }>(withParam(path, 'page_size', '1'));
        return [view, typeof body?.count === 'number' ? body.count : null] as const;
      } catch {
        return [view, null] as const;
      }
    })).then((pairs) => { if (live) setCounts(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [key, reloadKey]);
  return counts;
}
