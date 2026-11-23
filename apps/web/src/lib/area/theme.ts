'use client';

import { useEffect, useState } from 'react';
import { areaGet, areaPatch } from './api';

/**
 * The driver's and rider's theme (owner, 23 Nov): Light or Dark, saved to their account like the
 * console's, and kept on the device too so the first paint is right before the account answers.
 */
export type Theme = 'light' | 'dark';
const PATH = '/auth/theme/';

function paint(next: Theme) {
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('sg-theme', next); } catch { /* private mode */ }
  document.cookie = `sg-theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

let fetched = false;

export function useAreaTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    if (fetched) return;
    fetched = true;
    areaGet<{ theme?: string }>(PATH).then((r) => {
      if (r?.theme === 'light' || r?.theme === 'dark') { paint(r.theme); setTheme(r.theme); }
    }).catch(() => { /* signed out or offline: the device's choice stands */ });
  }, []);
  function set(next: Theme) {
    paint(next);
    setTheme(next);
    areaPatch(PATH, { theme: next }).catch(() => { /* kept on this device; saved next time */ });
  }
  return [theme, set];
}
