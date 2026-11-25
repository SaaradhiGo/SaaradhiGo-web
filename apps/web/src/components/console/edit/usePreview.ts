'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import type { ChangeDisplay } from './ChangePreview';

/**
 * The Edit pattern's live preview (owner, 25 Nov): POST the form to a setting's `preview/` endpoint
 * (debounced) and get back the `display` the approval request will carry. Writes nothing.
 */
export function usePreview(path: string | null, body: unknown): { display: ChangeDisplay | null; error: string | null } {
  const [display, setDisplay] = useState<ChangeDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(body ?? null);
  useEffect(() => {
    if (!path) { setDisplay(null); return undefined; }
    const t = window.setTimeout(() => {
      api.post<ChangeDisplay>(path, JSON.parse(key))
        .then((d) => { setDisplay(d); setError(null); })
        .catch((err) => { setDisplay(null); setError(err instanceof ApiError && err.fromServer ? err.message : 'The preview could not be worked out.'); });
    }, 400);
    return () => window.clearTimeout(t);
  }, [path, key]);
  return { display, error };
}
