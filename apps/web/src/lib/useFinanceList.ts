'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';
import {
  type ListFilters, apiPath, filtersFromSearch, filtersToQuery, rangeProblem,
} from '@/lib/finance';

/** The envelope every paginated Finance list answers with. */
export type FinancePage<T, X = unknown> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
} & X;

/**
 * Load one Finance list: filters live in the URL, the server does the
 * filtering, and a failed request is an error state, never an empty table.
 *
 * `apiBase` is the endpoint under /payments/admin/. `extra` adds fixed query
 * parameters (a page size, a tab) that are not part of the shareable URL.
 */
export function useFinanceList<T, X = unknown>(
  apiBase: string,
  extra: Record<string, string | number> = {},
) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = filtersFromSearch(new URLSearchParams(search.toString()));
  const extraKey = JSON.stringify(extra);
  const filtersKey = filtersToQuery(filters);

  const [data, setData] = useState<FinancePage<T, X> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    if (filters.from && filters.to) {
      const problem = rangeProblem(filters.from, filters.to);
      if (problem) { setError(problem); return; }
    }
    try {
      const path = apiPath(apiBase, filters, JSON.parse(extraKey));
      // A place named in the URL (a link from a city's board) wins over the
      // scope picker; otherwise the picker's selection applies.
      setData(await api.get<FinancePage<T, X>>(filters.scope ? path : withScope(path)));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this list.');
    }
    // `filters` is derived from `filtersKey`; depending on the string keeps the
    // effect from re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, filtersKey, extraKey]);

  useEffect(() => { void load(); }, [load]);

  const go = useCallback((next: ListFilters) => {
    const q = filtersToQuery(next);
    router.push(q ? `${pathname}?${q}` : pathname);
  }, [router, pathname]);

  return { filters, data, error, reload: load, go };
}
