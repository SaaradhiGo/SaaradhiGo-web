/**
 * Not-launched places stay quiet (owner 24 Nov): a city that is not live is left out of working
 * lists, counts and grids unless the operator turns on "Show not launched" in the place bar.
 */
import { useSyncExternalStore } from 'react';
import { getCachedAccess, useAdminAccess, type AdminScope } from '@/lib/adminScope';

const KEY = 'sg.console.showNotLaunched';

export function readShowNotLaunched(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function writeShowNotLaunched(on: boolean) {
  try { if (on) window.localStorage.setItem(KEY, '1'); else window.localStorage.removeItem(KEY); } catch { /* private window */ }
}

/** Codes of the held cities that are not live (draft): the ones hidden by default. Pure; tested. */
export function notLaunchedCodes(scopes: AdminScope[]): Set<string> {
  return new Set(scopes.filter((s) => s.kind === 'city' && s.status === 'draft').map((s) => s.code));
}

/** Is this place (a city code, or a code inside one) hidden right now? */
export function hiddenPlace(code: string | null | undefined, scopes = getCachedAccess()?.scopes ?? []): boolean {
  if (!code || readShowNotLaunched()) return false;
  const off = notLaunchedCodes(scopes);
  return [...off].some((c) => code === c || code.startsWith(`${c}-`));
}

const noop = () => () => {};
/** A filter for rows with a city code: drops not-launched cities unless the toggle is on. */
export function useLaunchedOnly() {
  const access = useAdminAccess();
  const show = useSyncExternalStore(noop, readShowNotLaunched, () => false);
  return function launchedOnly<T>(rows: T[], codeOf: (r: T) => string | null | undefined): T[] {
    if (show) return rows;
    const off = notLaunchedCodes(access?.scopes ?? []);
    if (!off.size) return rows;
    return rows.filter((r) => { const c = codeOf(r); return !c || ![...off].some((o) => c === o || c.startsWith(`${o}-`)); });
  };
}

/** Is the city with this name not launched (and the toggle off)? For rows that carry a name only. */
export function hiddenCityName(name: string | null | undefined, scopes = getCachedAccess()?.scopes ?? []): boolean {
  if (!name || readShowNotLaunched()) return false;
  return scopes.some((s) => s.kind === 'city' && s.status === 'draft' && s.name === name);
}
