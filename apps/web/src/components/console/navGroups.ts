import { AdminAccess, canAny } from '@/lib/adminScope';
import { PAGE_NEEDS } from '@/lib/consoleLinks';
import type { NavGroup, NavItem } from '@/components/console/Sidebar';
import {
  Gauge, LifeBuoy, MapPin, Route, Shield, Siren, UserRound, Users, Wallet,
} from '@/components/console/icons';

/**
 * The rail, as data, so the layout and the link-rule test read the same list.
 *
 * GROUPED THE WAY THE WORK IS. Operations, People, Money, Safety & Risk,
 * Settings -- and Growth, which has nothing in it yet and so is not drawn. A
 * group only appears when the operator holds at least one of its pages, and
 * an item only when they hold a capability that opens it: a link the server
 * would refuse is a dead end, not a feature (the link rule, AUDIT 27.40;
 * `lib/consoleLinks.ts`).
 *
 * `need` hides a link; it is NOT what stops the operator. Every endpoint
 * re-checks the permission and re-filters the rows.
 *
 * Growth (promotions, markets) has no page yet and so no group: a heading
 * with nothing under it is a promise the console cannot keep.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Command Centre', Icon: Gauge, need: PAGE_NEEDS.dashboard },
      { href: '/trips', label: 'Trips', Icon: Route, need: PAGE_NEEDS.trips },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/drivers', label: 'Drivers', Icon: Users, need: PAGE_NEEDS.drivers, countKey: 'drivers' },
      { href: '/riders', label: 'Riders', Icon: UserRound, need: PAGE_NEEDS.riders },
      { href: '/support', label: 'Support', Icon: LifeBuoy, need: PAGE_NEEDS.support, countKey: 'support' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/withdrawals', label: 'Withdrawals', Icon: Wallet, need: PAGE_NEEDS.withdrawals, countKey: 'withdrawals' },
    ],
  },
  {
    label: 'Safety & Risk',
    items: [
      // Open to the read-only `safety.read` as well as `safety.respond`.
      { href: '/safety-ops', label: 'Safety', Icon: Siren, need: PAGE_NEEDS.safety, countKey: 'sos', urgent: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/zones', label: 'Zones & fares', Icon: MapPin, need: PAGE_NEEDS.zones },
      // No `need`: the operator's OWN authenticator and recovery codes.
      // The endpoints behind it identify them from the token and answer
      // about nobody else, so every operator may open it.
      { href: '/settings/security', label: 'Security', Icon: Shield },
    ],
  },
];

function holds(access: AdminAccess | null, item: NavItem): boolean {
  if (!item.need) return true;
  return canAny(access, typeof item.need === 'string' ? [item.need] : item.need);
}

/** The groups and items this operator may open; empty groups dropped. */
export function visibleGroups(access: AdminAccess | null, groups: NavGroup[] = NAV_GROUPS): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((item) => holds(access, item)) }))
    .filter((g) => g.items.length > 0);
}

/** The first page they can open: where the brand mark goes. */
export function homeFor(groups: NavGroup[]): string {
  return groups[0]?.items[0]?.href ?? '/settings/security';
}
