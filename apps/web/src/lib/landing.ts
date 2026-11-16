import type { AdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';

/**
 * Where each role lands after signing in (owner, 2026-11-03):
 *
 *   Super Admin -> Global overview; a country lead -> their country; City Ops ->
 *   their city workspace (all three are /dashboard, which opens at the
 *   operator's own place); Safety -> the Safety board; KYC -> the KYC queue;
 *   Support -> the ticket inbox; Finance -> the money overview; Marketing and
 *   Analyst -> Reports.
 *
 * The first role that matches wins, in that order, and a landing the operator
 * cannot open falls through to the next: never a page that would refuse them.
 */
const ORDER: Array<{ roles: string[]; href: string; page: Parameters<typeof canOpen>[1] }> = [
  { roles: ['super_admin', 'city_ops_manager', 'country_lead'], href: '/ops/dashboard', page: 'dashboard' },
  { roles: ['safety_officer'], href: '/ops/safety-ops', page: 'safety' },
  { roles: ['kyc_verifier'], href: '/ops/kyc', page: 'drivers' },
  { roles: ['support_agent', 'support_lead'], href: '/ops/support', page: 'support' },
  { roles: ['finance'], href: '/ops/finance', page: 'finance' },
  { roles: ['marketing', 'analyst'], href: '/ops/reports', page: 'reports' },
];

export function landingFor(access: AdminAccess | null): string {
  if (!access) return '/ops/settings/security';
  const held = new Set((access.roles ?? []).map((r) => r.role));
  if (access.is_superuser) held.add('super_admin');
  for (const step of ORDER) {
    if (step.roles.some((r) => held.has(r)) && canOpen(access, step.page)) return step.href;
  }
  if (canOpen(access, 'dashboard')) return '/ops/dashboard';
  return '/ops/settings/security';
}
