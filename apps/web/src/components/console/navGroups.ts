import { AdminAccess, canAny } from '@/lib/adminScope';
import { PAGE_NEEDS } from '@/lib/consoleLinks';
import type { NavGroup, NavItem } from '@/components/console/Sidebar';
import {
  BarChart, Check, Cog, Flag, Gauge, Lock, Gift, LifeBuoy, MapPin, Megaphone, Percent, Radar, Route, Shield, Siren, TrendUp, UserRound, Users, Wallet,
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
 * Growth now holds Notifications (module 11) and Promotions (module 12); markets have no
 * page yet. A heading with nothing under it is a promise the console cannot
 * keep, so the group only appears for an operator who can open a page in it.
 */
export const NAV_GROUPS: NavGroup[] = [
  // SIX AREAS (owner, 2026-11-03; design board A). Every page sits in one, an area appears
  // only when the operator can open something in it, and a link only when they hold a
  // capability that opens it (the link rule; `need` hides, the server refuses).
  {
    label: 'Operate',
    items: [
      { href: '/dashboard', label: 'Overview', Icon: Gauge, need: PAGE_NEEDS.dashboard },
      // Dots for liveops.read, the heatmap alone for liveops.aggregate.
      { href: '/live-ops', label: 'Live map', Icon: Radar, need: PAGE_NEEDS.liveops },
      { href: '/trips', label: 'Trips', Icon: Route, need: PAGE_NEEDS.trips },
      // Open to the read-only `safety.read` as well as `safety.respond`.
      { href: '/safety-ops', label: 'Safety', Icon: Siren, need: PAGE_NEEDS.safety, countKey: 'sos', urgent: true },
      { href: '/support', label: 'Support', Icon: LifeBuoy, need: PAGE_NEEDS.support, countKey: 'support' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/drivers', label: 'Drivers', Icon: Users, need: PAGE_NEEDS.drivers },
      // The KYC review queue (board E); its count is the queue's own, so the badge matches the page.
      { href: '/kyc', label: 'Onboarding and KYC', Icon: Shield, need: PAGE_NEEDS.drivers, countKey: 'drivers' },
      { href: '/riders', label: 'Riders', Icon: UserRound, need: PAGE_NEEDS.riders },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/finance', label: 'Money overview', Icon: TrendUp, need: PAGE_NEEDS.finance },
      { href: '/finance/payments', label: 'Payments', Icon: Wallet, need: PAGE_NEEDS.finance },
      { href: '/finance/payouts', label: 'Payouts', Icon: Wallet, need: PAGE_NEEDS.withdrawals, countKey: 'withdrawals' },
      { href: '/finance/reconciliation', label: 'Reconciliation', Icon: BarChart, need: PAGE_NEEDS.finance },
    ],
  },
  {
    label: 'Grow',
    items: [
      // Rider promos, driver incentives, referrals (module 12): `promo.read`.
      { href: '/promotions', label: 'Promotions', Icon: Gift, need: PAGE_NEEDS.promotions },
      { href: '/promotions/incentives', label: 'Driver incentives', Icon: Gift, need: PAGE_NEEDS.promotions },
      { href: '/promotions/referrals', label: 'Referrals', Icon: Gift, need: PAGE_NEEDS.promotions },
      // Templates, campaigns, the delivery log and the providers (module 11): `notify.read`.
      { href: '/notifications', label: 'Messages', Icon: Megaphone, need: PAGE_NEEDS.notifications },
    ],
  },
  {
    label: 'Configure',
    items: [
      // Markets, flags, app versions, notices, settings and integrations (module 15).
      { href: '/settings', label: 'Countries and cities', Icon: Cog, need: PAGE_NEEDS.platform },
      { href: '/zones', label: 'Zones', Icon: MapPin, need: PAGE_NEEDS.zones },
      // Commission and fare cards (module 8). Readable with `zone.read`.
      { href: '/pricing', label: 'Pricing and commission', Icon: Percent, need: PAGE_NEEDS.pricing },
      { href: '/settings/integrations', label: 'Integrations and apps', Icon: Cog, need: ['platform.integrations.read', 'platform.read'] },
    ],
  },
  {
    label: 'Govern',
    items: [
      // Everything waiting for a second person, with the checker's count.
      { href: '/approvals', label: 'Approvals', Icon: Check, need: PAGE_NEEDS.approvals, countKey: 'approvals' },
      // The fraud review queue and the detection rules (module 13): `fraud.read`.
      { href: '/fraud', label: 'Fraud and risk', Icon: Flag, need: PAGE_NEEDS.fraud },
      { href: '/settings/audit', label: 'Audit log', Icon: Shield, need: ['audit.read'] },
      { href: '/settings/staff', label: 'Staff and roles', Icon: Users, need: PAGE_NEEDS.staff },
      { href: '/settings/data-requests', label: 'Data requests', Icon: Lock, need: PAGE_NEEDS.dataRequests },
      // Reports & Analytics (module 14): `report.read`.
      { href: '/reports', label: 'Reports', Icon: BarChart, need: PAGE_NEEDS.reports },
      // No `need`: the operator's OWN authenticator and recovery codes.
      { href: '/settings/security', label: 'My security', Icon: Lock },
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
