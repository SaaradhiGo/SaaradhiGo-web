/**
 * The company that operates SaaradhiGo in each market (13 Nov, Srini's rulings).
 *
 *   India  DeepTrics Software Solutions Pvt Ltd
 *   USA    DeepTrics LLC
 *
 * Everything else (registered office, CIN or state file number, contacts, the grievance officer,
 * GST registration) comes from the backend (`GET /config/` -> `legal`), which reads it from
 * configuration. A value that is not configured is absent, and every page leaves its line out:
 * nothing here is invented. The two names below are the fallback when the API cannot be reached.
 */
import type { Market } from '@/i18n/locales';

export type LegalEntity = {
  country: Market;
  legal_name: string;
  gst_registered: boolean;
  registered_address?: string;
  cin?: string;
  state_of_formation?: string;
  file_number?: string;
  support_email?: string;
  support_phone?: string;
  grievance_officer_name?: string;
  grievance_officer_email?: string;
  grievance_officer_phone?: string;
  gstin?: string;
};

export type LegalMap = Record<Market, LegalEntity>;

export const LEGAL_FALLBACK: LegalMap = {
  IN: { country: 'IN', legal_name: 'DeepTrics Software Solutions Pvt Ltd', gst_registered: false },
  US: { country: 'US', legal_name: 'DeepTrics LLC', gst_registered: false },
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

/** Server-side: the entities, refreshed every 5 minutes; the fallback names if the API is down. */
export async function fetchLegal(): Promise<LegalMap> {
  try {
    const r = await fetch(`${API}/config/`, { next: { revalidate: 300 } });
    if (!r.ok) return LEGAL_FALLBACK;
    const body = await r.json();
    const legal = body?.data?.legal ?? body?.legal;
    if (!legal?.IN?.legal_name || !legal?.US?.legal_name) return LEGAL_FALLBACK;
    return { IN: { ...legal.IN, country: 'IN' }, US: { ...legal.US, country: 'US' } };
  } catch {
    return LEGAL_FALLBACK;
  }
}

/** "© 2026 SaaradhiGo. Operated by DeepTrics LLC." The year is today's. */
export function copyrightLine(entity: LegalEntity, now: Date = new Date()): string {
  return `© ${now.getFullYear()} SaaradhiGo. Operated by ${entity.legal_name}.`;
}

/**
 * Which market a page speaks for, in the brief's order:
 *   1. what is on screen (a trip, receipt, statement or city page) -- `onScreen`;
 *   2. the visitor's footer choice, remembered;
 *   3. the signed-in account's market;
 *   4. where the browser is: the edge's country header, else the time zone;
 *   5. India.
 */
export function resolveLegalMarket(input: {
  onScreen?: string | null;
  chosen?: string | null;
  account?: string | null;
  edgeCountry?: string | null;
  timeZone?: string | null;
}): Market {
  for (const v of [input.onScreen, input.chosen, input.account, input.edgeCountry]) {
    const m = String(v ?? '').toUpperCase();
    if (m === 'IN' || m === 'US') return m;
  }
  const fromZone = marketOfTimeZone(input.timeZone);
  return fromZone ?? 'IN';
}

/** America/* and US-only zones read as the USA; Asia/Kolkata and Asia/Calcutta as India. */
export function marketOfTimeZone(tz?: string | null): Market | null {
  if (!tz) return null;
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'IN';
  if (/^America\//.test(tz) || /^US\//.test(tz) || tz === 'Pacific/Honolulu') return 'US';
  return null;
}

/** The country headers a CDN or edge adds to a request, first match wins. */
export const EDGE_COUNTRY_HEADERS = [
  'cloudfront-viewer-country',
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-country-code',
] as const;

/** The policy pages, linked from the footer and both apps. */
export const POLICY_PAGES = {
  about: '/about',
  contact: '/contact',
  fares: '/fares',
  riderTerms: '/terms',
  driverTerms: '/driver-terms',
  privacy: '/privacy',
  refunds: '/refunds',
  textMessages: '/text-messages',
  grievance: '/grievance',
  cookies: '/cookies',
  safety: '/safety',
} as const;
