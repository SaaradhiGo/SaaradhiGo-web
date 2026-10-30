/**
 * What this operator holds, and which part of it they are looking at.
 *
 * THE CONSOLE USED TO SHOW EVERY NAV ITEM TO EVERYBODY
 * ----------------------------------------------------
 * `ops_role` lived in the database and no endpoint returned it, so the
 * console could not tell a Support Agent from Finance. An operator learned
 * what they were not allowed to do by clicking it and reading a 403.
 * `/admin-access/me/` now answers that, and this module is the one place
 * that reads it.
 *
 * NONE OF THIS IS SECURITY
 * ------------------------
 * Hiding a button stops an operator wasting a click. It stops nothing
 * else: every endpoint re-checks the permission and re-filters the
 * queryset server-side, and this file could be rewritten in a browser
 * console without gaining access to a single row. So when in doubt, SHOW
 * the thing and let the server refuse it — a hidden control that should
 * have been visible is a support ticket, while a visible control that gets
 * refused is merely a dead end.
 *
 * THE SELECTED SCOPE CAN ONLY NARROW
 * ----------------------------------
 * It is sent as `?scope=<code>` and the server intersects it with the
 * caller's assignments, refusing a code they do not hold rather than
 * falling back to everything. So a stale tab holding a revoked scope gets
 * an error, never a wider view than the operator chose.
 */

import { useSyncExternalStore } from 'react';
import { api, readToken } from '@/lib/api';

export const SCOPE_KEY = 'saaradhi_admin_scope';

export type AdminScope = {
  code: string;
  name: string;
  kind: 'global' | 'country' | 'state' | 'city' | string;
  status: string;
  depth: number;
  /** Materialised path (`/IN/IN-TG/IN-TG-HYD/`): lets a per-city link be decided. */
  path?: string;
};

export type AdminAccess = {
  id: number | string;
  email: string;
  full_name: string;
  is_superuser: boolean;
  is_break_glass: boolean;
  permissions: string[];
  roles: {
    role: string;
    role_name: string;
    scope: string;
    scope_name: string;
    scope_kind: string;
    /** The place the role is held, and the capability names it carries: nothing else. */
    scope_path?: string;
    permissions?: string[];
  }[];
  /**
   * True when the account is not narrowed to any place (a superuser, a
   * Global assignment, or an account the migration has not reached).
   */
  unrestricted?: boolean;
  scopes: AdminScope[];
  /**
   * Which model answered for this account.
   *
   * `legacy_unscoped` means the account has no assignments yet and is
   * still being served by the pre-migration path — it sees everything.
   * The console says so out loud rather than drawing a scope picker that
   * does nothing.
   */
  access_model: 'assignments' | 'legacy_unscoped' | 'denied';
  /**
   * How many more named Super Admins the platform needs. Non-zero is
   * shown as a persistent banner to Super Admins and to nobody else --
   * it is a prompt to act, and everyone else can do nothing about it.
   */
  super_admin_shortfall: number;
};

// The last answer, for pages that render after the shell has already
// asked. The shell renders nothing until it knows, so by the time a page
// runs this is filled in; a page must still cope with `null`.
let cached: AdminAccess | null = null;

// Who wants to know when the answer changes. A component that reads the
// cache at render time sees whatever was there when it rendered; one that
// subscribes re-renders when the shell's fetch lands. `useAdminAccess`
// below is the subscription; `getCachedAccess` is the plain read.
const listeners = new Set<() => void>();

function setCached(next: AdminAccess | null) {
  cached = next;
  listeners.forEach((fn) => fn());
}

export async function fetchAdminAccess(): Promise<AdminAccess | null> {
  if (!readToken()) return null;
  try {
    setCached(await api.get<AdminAccess>('/admin-access/me/'));
    return cached;
  } catch {
    // A failure here must not blank the console. The caller renders
    // without permission hints, which shows more rather than less, and
    // the server still refuses what it should.
    setCached(null);
    return null;
  }
}

export function getCachedAccess(): AdminAccess | null {
  return cached;
}

function subscribeAccess(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * The cached access, as a hook: re-renders when the shell's fetch lands.
 *
 * On the server there is no token and no cache, so the snapshot is null
 * there and on the first client render, which is what keeps the two in
 * agreement.
 */
export function useAdminAccess(): AdminAccess | null {
  return useSyncExternalStore(subscribeAccess, getCachedAccess, () => null);
}

/**
 * The scope the operator is looking at, as a node: the selected one, or
 * the only one they hold, or the shallowest. Null when unknown.
 */
export function currentScope(access: AdminAccess | null): AdminScope | null {
  if (!access || access.access_model === 'legacy_unscoped') return null;
  const code = readSelectedScope();
  if (code) {
    const match = access.scopes.find((s) => s.code === code);
    if (match) return match;
  }
  if (access.scopes.length === 1) return access.scopes[0];
  return access.scopes.reduce<AdminScope | null>(
    (best, s) => (!best || s.depth < best.depth ? s : best),
    null,
  );
}

export function readSelectedScope(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SCOPE_KEY) || null;
  } catch {
    return null;
  }
}

export function writeSelectedScope(code: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (code) window.localStorage.setItem(SCOPE_KEY, code);
    else window.localStorage.removeItem(SCOPE_KEY);
  } catch {
    // Private browsing. The console then shows the full held scope, which
    // is correct, just not remembered between loads.
  }
}

/**
 * Append the selected scope to a console query.
 *
 * Returns the path unchanged when nothing is selected, so a caller can use
 * it unconditionally.
 */
export function withScope(path: string): string {
  const code = readSelectedScope();
  if (!code) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}scope=${encodeURIComponent(code)}`;
}

/**
 * Does this operator hold this permission anywhere?
 *
 * "Anywhere" is the right question for drawing a nav item: an operator who
 * can approve payouts in one city should see the Withdrawals link. Whether
 * they may act on a PARTICULAR row is the server's answer, not this one.
 *
 * THE LINK RULE (owner, AUDIT 27.40): never render a link, nav item, tab,
 * button or count that leads to a page or action the role cannot open. So
 * this hides when in doubt: unknown access (the lookup failed) holds
 * nothing, and an unmigrated account is read from the same list as everyone
 * else (`/admin-access/me/` now describes what the API will allow it,
 * legacy grants included). Hiding is not security -- the server still
 * refuses -- it is what keeps the console from offering a dead end.
 */
export function can(access: AdminAccess | null, permission: string): boolean {
  if (!access) return false;
  return access.permissions.includes(permission);
}

/** Does the operator hold ANY of these? (A page that two capabilities open.) */
export function canAny(access: AdminAccess | null, permissions: readonly string[]): boolean {
  return permissions.some((p) => can(access, p));
}

/**
 * Does the operator hold `permission` at this city? For a link on one
 * city's board: a role held at another city must not draw it here.
 * Falls back to "anywhere" when the API did not say where (an older
 * backend), which the server then refuses row by row.
 */
export function canAt(
  access: AdminAccess | null, permission: string, cityCode: string | null | undefined,
): boolean {
  if (!can(access, permission)) return false;
  if (!access || access.unrestricted || access.access_model === 'legacy_unscoped') return true;
  const held = (access.roles ?? []).filter((r) => r.scope_path && r.permissions);
  const path = (access.scopes ?? []).find((s) => s.code === cityCode)?.path;
  if (held.length === 0 || !path) return true;
  return held.some((r) => path.startsWith(r.scope_path as string)
    && (r.permissions as string[]).includes(permission));
}

/**
 * May this operator ask for a personal value to be unmasked?
 *
 * Stricter than `can`: unknown access HIDES the affordance. Everything
 * else in the console shows a control when in doubt and lets the server
 * refuse it, because a hidden control is a support ticket. A reveal is
 * the one place that rule inverts -- the value is already on screen in a
 * form the operator may read, and the control's only job is to hand over
 * more; an operator the console cannot vouch for gets the masked value,
 * which is what everyone gets anyway. Legacy unscoped accounts are served
 * through the bridge, which grants `pii.view`, so they see it.
 */
export function canRevealPii(access: AdminAccess | null): boolean {
  if (!access) return false;
  if (access.access_model === 'legacy_unscoped') return true;
  return access.permissions.includes('pii.view');
}

/** A label for the scope being viewed, for the shell to display. */
export function scopeLabel(access: AdminAccess | null): string {
  if (!access) return '';
  if (access.access_model === 'legacy_unscoped') return 'All regions';
  const code = readSelectedScope();
  if (code) {
    const match = access.scopes.find((s) => s.code === code);
    if (match) return match.name;
  }
  if (access.scopes.length === 1) return access.scopes[0].name;
  const shallowest = access.scopes.reduce<AdminScope | null>(
    (best, s) => (!best || s.depth < best.depth ? s : best),
    null,
  );
  return shallowest ? `${shallowest.name} (all)` : '';
}


/**
 * Is this account shut out entirely?
 *
 * True only under strict mode with no assignment. The console renders an
 * explanation rather than an empty shell: an operator whose access was
 * just tightened needs to be told that, not left wondering whether the
 * product is broken.
 */
export function isLockedOut(access: AdminAccess | null): boolean {
  return access?.access_model === 'denied';
}
