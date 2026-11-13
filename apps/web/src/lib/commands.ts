import type { AdminAccess } from '@/lib/adminScope';
import { type Page, canOpen } from '@/lib/consoleLinks';

/**
 * Ctrl K commands (owner, 2026-11-03): type an ID or a page and go there.
 *
 *   "SOS-1042", "T-881230", "D-2231", "APR-5"  -> open that record
 *   "approvals", "payouts", "kyc"               -> open that page
 *
 * A command appears only when the operator can open its page (the link rule,
 * `canOpen`): the palette never offers what the buttons would not, and the
 * server re-checks scope on the record itself.
 */

export type Command = { key: string; label: string; detail: string; href: string };

type RefSpec = { prefix: string; page: Page; label: string; href: (n: number) => string };

const REFS: RefSpec[] = [
  { prefix: 'SOS', page: 'safety', label: 'SOS', href: (n) => `/ops/safety-ops/incidents/${n}` },
  { prefix: 'INC', page: 'safety', label: 'Safety case', href: (n) => `/ops/safety-ops/incidents/${n}` },
  { prefix: 'TKT', page: 'support', label: 'Ticket', href: (n) => `/ops/support/${n}` },
  { prefix: 'APR', page: 'approvals', label: 'Approval request', href: (n) => `/ops/approvals?id=${n}` },
  { prefix: 'PO', page: 'withdrawals', label: 'Payout', href: (n) => `/ops/finance/payouts?id=${n}` },
  { prefix: 'T', page: 'trips', label: 'Trip', href: (n) => `/ops/trips/${n}` },
  { prefix: 'D', page: 'drivers', label: 'Driver', href: (n) => `/ops/drivers/${n}` },
  { prefix: 'R', page: 'riders', label: 'Rider', href: (n) => `/ops/riders/${n}` },
];

const REF = /^\s*(SOS|INC|TKT|APR|PO|T|D|R)\s*[-#]?\s*(\d{1,12})\s*$/i;

/** The record a readable ID names, or null. Pure; tested. */
export function parseRef(text: string): { spec: RefSpec; id: number } | null {
  const m = REF.exec(text);
  if (!m) return null;
  const spec = REFS.find((r) => r.prefix === m[1].toUpperCase());
  return spec ? { spec, id: Number(m[2]) } : null;
}

type PageSpec = { page: Page; label: string; href: string; words: string[] };

const PAGES: PageSpec[] = [
  { page: 'dashboard', label: 'Overview', href: '/ops/dashboard', words: ['overview', 'command', 'home', 'global'] },
  { page: 'approvals', label: 'Approvals', href: '/ops/approvals', words: ['approvals', 'approve', 'checker'] },
  { page: 'safety', label: 'Safety board', href: '/ops/safety-ops', words: ['safety', 'sos', 'incidents'] },
  { page: 'liveops', label: 'Live map', href: '/ops/live-ops', words: ['live', 'map'] },
  { page: 'trips', label: 'Trips', href: '/ops/trips', words: ['trips', 'rides'] },
  { page: 'trips', label: 'Stuck trips', href: '/ops/trips?stuck=1', words: ['stuck'] },
  { page: 'drivers', label: 'Drivers', href: '/ops/drivers', words: ['drivers'] },
  { page: 'drivers', label: 'KYC queue', href: '/ops/kyc', words: ['kyc', 'documents', 'onboarding'] },
  { page: 'riders', label: 'Riders', href: '/ops/riders', words: ['riders', 'customers'] },
  { page: 'support', label: 'Support tickets', href: '/ops/support', words: ['support', 'tickets'] },
  { page: 'withdrawals', label: 'Payouts', href: '/ops/finance/payouts', words: ['payouts', 'withdrawals'] },
  { page: 'withdrawals', label: 'Failed payouts', href: '/ops/finance/payouts?status=failed', words: ['failed'] },
  { page: 'finance', label: 'Money overview', href: '/ops/finance', words: ['finance', 'money'] },
  { page: 'finance', label: 'Refunds', href: '/ops/finance/refunds', words: ['refunds', 'refund'] },
  { page: 'pricing', label: 'Pricing and commission', href: '/ops/pricing', words: ['pricing', 'fares', 'commission'] },
  { page: 'pricing', label: 'Vehicle classes', href: '/ops/pricing/vehicle-classes', words: ['vehicle', 'classes', 'suv', 'sedan'] },
  { page: 'promotions', label: 'Promotions', href: '/ops/promotions', words: ['promotions', 'promo', 'codes'] },
  { page: 'notifications', label: 'Messages', href: '/ops/notifications', words: ['messages', 'notifications', 'campaigns'] },
  { page: 'zones', label: 'Zones', href: '/ops/zones', words: ['zones', 'geofence'] },
  { page: 'fraud', label: 'Fraud and risk', href: '/ops/fraud', words: ['fraud', 'risk'] },
  { page: 'reports', label: 'Reports', href: '/ops/reports', words: ['reports', 'export'] },
  { page: 'platform', label: 'Countries and cities', href: '/ops/settings', words: ['countries', 'cities', 'markets'] },
  { page: 'platform', label: 'Audit log', href: '/ops/settings/audit', words: ['audit', 'log'] },
  { page: 'staff', label: 'Staff and roles', href: '/ops/settings/staff', words: ['staff', 'roles', 'operators', 'invite'] },
  { page: 'dataRequests', label: 'Data requests', href: '/ops/settings/data-requests', words: ['data', 'privacy', 'erasure', 'export', 'gdpr', 'dpdp'] },
];

export function commandsFor(term: string, access: AdminAccess | null): Command[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const out: Command[] = [];
  const ref = parseRef(term);
  if (ref && canOpen(access, ref.spec.page)) {
    const code = `${ref.spec.prefix}-${ref.id}`;
    out.push({ key: `ref-${code}`, label: `Open ${code}`, detail: ref.spec.label, href: ref.spec.href(ref.id) });
  }
  if (q.length >= 2 && !ref) {
    for (const p of PAGES) {
      if (!canOpen(access, p.page)) continue;
      if (p.label.toLowerCase().startsWith(q) || p.words.some((w) => w.startsWith(q))) {
        out.push({ key: `go-${p.href}`, label: p.label, detail: 'Go to page', href: p.href });
      }
    }
  }
  return out.slice(0, 6);
}
