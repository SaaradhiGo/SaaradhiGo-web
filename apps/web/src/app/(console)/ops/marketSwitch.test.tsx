/**
 * The console's market switch, page by page (14 Nov, Srini's brief section 2).
 *
 * With United States selected, every console page must ask its API for the US only
 * (`?scope=US`; the server narrows the rows). Before this, Staff and roles, the audit
 * log, data requests, countries and cities, reports and the live map asked for
 * everything, so the Hyderabad staff stayed listed under United States.
 *
 * Each page is rendered with US selected and the API held open (a request that never
 * answers), and the test reads the address the page asked for. Integrations is a small
 * platform configuration list narrowed on the page, so its test answers the request.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import { SCOPE_KEY } from '@/lib/adminScope';
import { PAGE_NEEDS } from '@/lib/consoleLinks';

vi.mock('next/navigation', () => {
  // Stable objects, as Next's are: a page whose effect depends on the router or the
  // search params would otherwise re-run on every render.
  const router = { push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined };
  const search = new URLSearchParams('');
  const params = {};
  return {
    useParams: () => params, useRouter: () => router,
    useSearchParams: () => search, usePathname: () => '/ops',
  };
});

const ACCESS = {
  id: 1, email: 'root@example.test', full_name: 'Root', is_superuser: false, is_break_glass: false,
  permissions: Array.from(new Set([
    ...Object.values(PAGE_NEEDS).flat(), 'zone.read', 'admin.manage', 'audit.read', 'privacy.read',
    'privacy.erasure', 'report.read', 'platform.read', 'platform.integrations.read', 'liveops.read',
  ])),
  roles: [], unrestricted: true, access_model: 'assignments', super_admin_shortfall: 0,
  scopes: [
    { code: 'GLOBAL', name: 'Global', kind: 'global', status: 'active', depth: 0, path: 'GLOBAL/' },
    { code: 'IN', name: 'India', kind: 'country', status: 'active', depth: 1, path: 'GLOBAL/IN/' },
    { code: 'US', name: 'United States', kind: 'country', status: 'active', depth: 1, path: 'GLOBAL/US/' },
  ],
};
vi.mock('@/lib/adminScope', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/adminScope')>();
  return { ...actual, useAdminAccess: () => ACCESS, getCachedAccess: () => ACCESS };
});

const calls: string[] = [];
let answer: ((url: string) => unknown) | null = null;

beforeEach(() => {
  calls.length = 0;
  answer = null;
  window.localStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  window.localStorage.setItem(SCOPE_KEY, 'US');
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = String(url);
    calls.push(u);
    const data = answer?.(u);
    if (data === undefined) return new Promise(() => undefined); // held open: the page stays loading
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data }) });
  }));
  // The live map opens a socket once its snapshot lands; it never lands here.
  vi.stubGlobal('WebSocket', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type PageCase = [label: string, load: () => Promise<{ default: ComponentType }>, endpoint: string];

// Page -> the API it lists from. Every one must carry the switch.
const PAGES: PageCase[] = [
  ['Overview', () => import('./dashboard/page'), '/command-centre/admin/'],
  ['Live map', () => import('./live-ops/page'), '/live-ops/admin/snapshot/'],
  ['Trips', () => import('./trips/page'), '/admin/trips'],
  ['Safety', () => import('./safety-ops/page'), '/safety/admin/'],
  ['Support', () => import('./support/page'), '/support/admin/tickets'],
  ['Drivers', () => import('./drivers/page'), '/driver/admin'],
  ['Onboarding and KYC', () => import('./kyc/page'), '/driver/admin'],
  ['Riders', () => import('./riders/page'), '/rider/admin'],
  ['Money overview', () => import('./finance/page'), '/payments/admin/overview/'],
  ['Payments', () => import('./finance/payments/page'), '/payments/admin/payments/'],
  ['Payouts', () => import('./finance/payouts/page'), '/payments/admin/payouts/'],
  ['Reconciliation', () => import('./finance/reconciliation/page'), '/payments/admin/reconciliation/'],
  ['Promotions', () => import('./promotions/page'), '/promotions/admin/campaigns/'],
  ['Driver incentives', () => import('./promotions/incentives/page'), '/promotions/admin/campaigns/'],
  ['Referrals', () => import('./promotions/referrals/page'), '/promotions/admin/campaigns/'],
  ['Messages', () => import('./notifications/page'), '/notifications/admin/templates/'],
  ['Countries and cities', () => import('./settings/page'), '/platform/admin/markets/'],
  ['Zones', () => import('./zones/page'), '/pricing/admin/zones/'],
  ['Pricing and commission', () => import('./pricing/page'), '/pricing/admin/commission/'],
  ['Approvals', () => import('./approvals/page'), '/approvals/admin/requests/'],
  ['Fraud and risk', () => import('./fraud/page'), '/fraud/admin/flags/'],
  ['Audit log', () => import('./settings/audit/page'), '/admin-audit/admin/entries/'],
  ['Staff and roles', () => import('./settings/staff/page'), '/admin-access/staff/?'],
  ['Data requests', () => import('./settings/data-requests/page'), '/auth/admin/data-requests/'],
  ['Reports', () => import('./reports/page'), '/reports/admin/catalogue/'],
];

describe('the market switch on United States', () => {
  it.each(PAGES)('%s asks its API for the US only', async (_label, load, endpoint) => {
    const { default: Page } = await load();
    render(<Page />);
    await waitFor(() => {
      const hit = calls.filter((u) => u.includes(endpoint));
      expect(hit.length, `no request to ${endpoint}; saw ${calls.join(', ') || 'none'}`).toBeGreaterThan(0);
      expect(hit.every((u) => /[?&]scope=US(&|$)/.test(u)), `unscoped: ${hit.join(', ')}`).toBe(true);
    });
  });

  it('Integrations shows the US and shared providers, not India’s', async () => {
    const row = (type: string, country: string, provider: string) => ({
      type, label: `${type} provider`, country, provider, configured: true, mode: 'live', blocker: null,
      last_success_at: null, last_error_at: null, env_vars: [], note: '',
    });
    answer = (u) => (u.includes('/platform/admin/integrations/') ? {
      live_send: false, production: false, live_providers_required: false,
      rows: [row('payments', 'IN', 'Razorpay'), row('payments', 'US', 'Stripe'), row('maps', 'all', 'Google')],
    } : undefined);
    const { default: Page } = await import('./settings/integrations/page');
    render(<Page />);
    expect(await screen.findByText('Stripe')).toBeTruthy();
    expect(screen.getByText('Google')).toBeTruthy();
    expect(screen.queryByText('Razorpay')).toBeNull();
  });
});
