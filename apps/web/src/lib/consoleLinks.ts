import { AdminAccess, canAny, canAt } from '@/lib/adminScope';

/**
 * THE LINK RULE (owner, AUDIT 27.40)
 * ----------------------------------
 * Never render a link, nav item, tab, button or count that leads to a page
 * or action the signed-in role cannot open. HIDE it; do not disable it. A
 * hidden link that would 403 is still guarded server-side -- this is the
 * console not offering a dead end, never the control.
 *
 * ONE TABLE. Every page the console links to is listed here with the
 * capabilities that open it (any one of them). Every link, nav item, board
 * tile and header badge asks `canOpen` instead of naming a permission, so
 * the answer cannot drift between the sidebar, the Command Centre board,
 * the person pages and the search results. The permissions are what the
 * page's own API needs; the Safety pages open for the read-only
 * `safety.read` as well as `safety.respond`.
 *
 * It is driven by the capability list the API returns for the signed-in
 * operator (`/admin-access/me/`): capability names and the place they are
 * held, nothing else. `lib/consoleLinks.test.ts` pins the table, and
 * `components/console/links.test.tsx` renders the nav and the board for
 * every role template.
 */
export type Page =
  | 'dashboard' | 'trips' | 'drivers' | 'riders' | 'support' | 'supportInbox'
  | 'withdrawals' | 'safety' | 'safetyConfig' | 'zones';

export const PAGE_NEEDS: Record<Page, readonly string[]> = {
  dashboard: ['trip.read'],
  trips: ['trip.read'],
  drivers: ['driver.read'],
  riders: ['rider.read'],
  support: ['support.read'],
  supportInbox: ['support.read'],
  withdrawals: ['finance.read'],
  safety: ['safety.read', 'safety.respond'],
  safetyConfig: ['safety.read', 'safety.respond'],
  zones: ['zone.write'],
};

/** May this operator open the page, anywhere? */
export function canOpen(access: AdminAccess | null, page: Page): boolean {
  return canAny(access, PAGE_NEEDS[page]);
}

/** May this operator open the page for ONE city (a link on that city's board)? */
export function canOpenAt(access: AdminAccess | null, page: Page, city: string | null | undefined): boolean {
  return PAGE_NEEDS[page].some((p) => canAt(access, p, city));
}
