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
  | 'withdrawals' | 'finance' | 'safety' | 'safetyConfig' | 'zones' | 'pricing' | 'liveops';

export const PAGE_NEEDS: Record<Page, readonly string[]> = {
  // The Command Centre opens for `report.read` too: Marketing keeps it with
  // the aggregate board only (no live SOS, no money, no person), which the
  // overview endpoint enforces (owner ruling 4, AUDIT 27.43).
  dashboard: ['trip.read', 'report.read'],
  trips: ['trip.read'],
  drivers: ['driver.read'],
  riders: ['rider.read'],
  support: ['support.read'],
  supportInbox: ['support.read'],
  // The payout queue (the old Withdrawals page now lives at /finance/payouts).
  withdrawals: ['finance.read'],
  // The Finance pages: overview, payments, settlements, payouts, reconciliation
  // and a driver's ledger. One capability opens them all.
  finance: ['finance.read'],
  safety: ['safety.read', 'safety.respond'],
  safetyConfig: ['safety.read', 'safety.respond'],
  zones: ['zone.write'],
  // Pricing & fares (module 8): the commission matrix and the fare cards. READING
  // is `zone.read`; drafting and submitting also need `pricing.write`, which the
  // pages ask for themselves. Zones stay on their own page (module 9).
  pricing: ['zone.read'],
  // The Live Ops map (module 10). `liveops.read` shows driver dots and trips;
  // `liveops.aggregate` shows the demand and supply heatmap alone. Either opens it.
  liveops: ['liveops.read', 'liveops.aggregate'],
};

/** May this operator open the page, anywhere? */
export function canOpen(access: AdminAccess | null, page: Page): boolean {
  return canAny(access, PAGE_NEEDS[page]);
}

/** May this operator open the page for ONE city (a link on that city's board)? */
export function canOpenAt(access: AdminAccess | null, page: Page, city: string | null | undefined): boolean {
  return PAGE_NEEDS[page].some((p) => canAt(access, p, city));
}
