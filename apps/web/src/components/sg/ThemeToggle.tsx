'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from './icons';
import { useT } from '@/i18n/LocaleProvider';

type Theme = 'light' | 'dark';

/** The theme `<html>` carries; the inline script in the root layout set it before paint. */
function current(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/**
 * The public theme switch (owner, 2026-11-06): a sun in dark, a moon in light.
 * The choice goes to localStorage and a year-long cookie, and the root
 * layout's script reads either back before the next first paint.
 */
export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => setTheme(current()), []);

  const flip = () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sg-theme', next); } catch { /* private mode */ }
    document.cookie = `sg-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="hp-theme"
      onClick={flip}
      aria-label={theme === 'dark' ? t.nav.toLight : t.nav.toDark}
      title={theme === 'dark' ? t.nav.toLight : t.nav.toDark}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}
