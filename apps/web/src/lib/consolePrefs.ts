/**
 * An operator's own settings for the console: theme, table density and
 * whether the sidebar is collapsed.
 *
 * All three live in localStorage and nowhere else. They are conveniences,
 * not state: a browser that cannot store them gets the defaults every time
 * and the console works exactly the same.
 *
 * Read after mount, never during render. localStorage does not exist while
 * the server renders, so a value read in `useState(init)` makes the two
 * renders disagree -- React error 418, which this console has shipped once
 * already.
 */
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
export type Density = 'comfortable' | 'compact';

const THEME_KEY = 'saaradhi_console_theme';
const DENSITY_KEY = 'saaradhi_console_density';
const SIDEBAR_KEY = 'saaradhi_console_sidebar';

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the preference lasts for this page only */
  }
}

export function readTheme(): Theme {
  return read(THEME_KEY) === 'light' ? 'light' : 'dark';
}
export function writeTheme(theme: Theme) {
  write(THEME_KEY, theme);
}

export function readDensity(): Density {
  return read(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
}
export function writeDensity(density: Density) {
  write(DENSITY_KEY, density);
}

export function readSidebarCollapsed(): boolean {
  return read(SIDEBAR_KEY) === 'collapsed';
}
export function writeSidebarCollapsed(collapsed: boolean) {
  write(SIDEBAR_KEY, collapsed ? 'collapsed' : null);
}

/**
 * The theme, as a hook. Dark until mounted, which is also the default, so
 * the first paint and the hydrated one agree for everyone who has not
 * chosen otherwise.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('dark');
  useEffect(() => setThemeState(readTheme()), []);
  const setTheme = useCallback((t: Theme) => {
    writeTheme(t);
    setThemeState(t);
  }, []);
  return [theme, setTheme];
}

export function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensityState] = useState<Density>('comfortable');
  useEffect(() => setDensityState(readDensity()), []);
  const setDensity = useCallback((d: Density) => {
    writeDensity(d);
    setDensityState(d);
  }, []);
  return [density, setDensity];
}
