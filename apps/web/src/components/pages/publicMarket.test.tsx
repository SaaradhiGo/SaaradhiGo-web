/**
 * Public pages follow the visitor's market (owner, 14 Nov): a US visitor reads no India-only
 * words or rupee amounts on any public page, and the home page's phone mock-ups show US classes.
 *
 * Out of scope by design: /grievance (India's grievance-redressal process, kept as is) and
 * /role-gate (an async server page with no market copy).
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { LegalProvider } from '@/components/sg/LegalProvider';
import type { Language } from '@/i18n/locales';

import Home from '@/app/(public)/page';
import About from '@/app/(public)/about/page';
import Accessibility from '@/app/(public)/accessibility/page';
import Contact from '@/app/(public)/contact/page';
import Cookies from '@/app/(public)/cookies/page';
import DeleteAccount from '@/app/(public)/delete-account/page';
import Drive from '@/app/(public)/drive/page';
import DriverTerms from '@/app/(public)/driver-terms/page';
import DriverSignIn from '@/app/(public)/driver/sign-in/page';
import DriverSignUp from '@/app/(public)/driver/sign-up/page';
import Fares from '@/app/(public)/fares/page';
import ForgotPassword from '@/app/(public)/forgot-password/page';
import Help from '@/app/(public)/help/page';
import Privacy from '@/app/(public)/privacy/page';
import Refunds from '@/app/(public)/refunds/page';
import ResetPassword from '@/app/(public)/reset-password/page';
import Ride from '@/app/(public)/ride/page';
import Safety from '@/app/(public)/safety/page';
import SignIn from '@/app/(public)/sign-in/page';
import SignUp from '@/app/(public)/sign-up/page';
import Terms from '@/app/(public)/terms/page';
import TextMessages from '@/app/(public)/text-messages/page';
import VerifyEmail from '@/app/(public)/verify-email/page';
import ZeroTolerance from '@/app/(public)/zero-tolerance/page';
import PublicLayout from '@/app/(public)/layout';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const PAGES: [string, ComponentType][] = [
  ['/', Home], ['/about', About], ['/accessibility', Accessibility], ['/contact', Contact],
  ['/cookies', Cookies], ['/delete-account', DeleteAccount], ['/drive', Drive],
  ['/driver-terms', DriverTerms], ['/driver/sign-in', DriverSignIn], ['/driver/sign-up', DriverSignUp],
  ['/fares', Fares], ['/forgot-password', ForgotPassword], ['/help', Help], ['/privacy', Privacy],
  ['/refunds', Refunds], ['/reset-password', ResetPassword], ['/ride', Ride], ['/safety', Safety],
  ['/sign-in', SignIn], ['/sign-up', SignUp], ['/terms', Terms], ['/text-messages', TextMessages],
  ['/verify-email', VerifyEmail], ['/zero-tolerance', ZeroTolerance],
];

/** India-only words and amounts a US visitor must not read. */
const INDIA_ONLY = /₹|\bINR\b|\brupees?\b|\bUPI\b|\bAadhaar\b|\bGST(IN)?\b|\bPAN\b|\bHyderabad\b|\bTelangana\b|\blakhs?\b|\bcrores?\b|\bAuto\b|\bMini\b|\bSedan\b|\bSUV\b|\bkm\b|\bkilomet(?:er|re)s?\b|Motor Vehicles? Aggregator|\bRBI\b|\bDPDP\b|\bTRAI\b|\bDLT\b/;

/**
 * Lines a US visitor may legitimately read that mention India: the footer's market switch
 * ("India") is not matched by the pattern; nothing else is allowed today.
 */
const ALLOWED: RegExp[] = [];

function textOf(Page: ComponentType, market: 'IN' | 'US', language: Language = 'en') {
  cleanup();
  // LocaleProvider keeps the server's language when the visitor's language cookie is present.
  document.cookie = `sg-language=${language}; path=/`;
  const { container } = render(
    <LocaleProvider initialLanguage={language}>
      <LegalProvider initialMarket={market} decided>
        <Page />
      </LegalProvider>
    </LocaleProvider>,
  );
  let text = container.textContent ?? '';
  for (const a of ALLOWED) text = text.replace(a, '');
  return text;
}

function hits(text: string) {
  const g = new RegExp(INDIA_ONLY.source, 'g');
  return [...new Set([...text.matchAll(g)].map((m) => {
    const i = m.index ?? 0;
    return `${m[0]} … ${text.slice(Math.max(0, i - 40), i + 40)}`;
  }))];
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { cities: [] } }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('public pages for a US visitor', () => {
  it.each(PAGES)('%s has no India-only words or rupee amounts', (_path, Page) => {
    expect(hits(textOf(Page, 'US'))).toEqual([]);
  });

  it('the header and footer have none either', () => {
    expect(hits(textOf(() => <PublicLayout><p>page</p></PublicLayout>, 'US'))).toEqual([]);
  });

  it('help answers "How do I pay?" with card, not cash', () => {
    const text = textOf(Help, 'US');
    expect(text).toMatch(/By card in the app/);
    expect(text).not.toMatch(/cash/i);
  });

  it.each(['es', 'hi', 'te'] as Language[])('the ride page in %s names the US classes', (language) => {
    const text = textOf(Ride, 'US', language);
    expect(text).toMatch(/Standard[ ,y]+XL/);
    expect(text).not.toMatch(/\bSedan\b|\bAuto\b/);
  });
});

describe('public pages for an India visitor', () => {
  it('the ride page keeps the India classes', () => {
    expect(textOf(Ride, 'IN')).toMatch(/Auto.*Sedan|Sedan.*Auto/s);
  });
  it('the home page names Hyderabad on its map, with no made-up trip (20 Nov)', () => {
    expect(textOf(Home, 'IN')).toMatch(/Hyderabad/);
    expect(textOf(Home, 'IN')).not.toMatch(/HITEC City|Charminar/);
  });
});

describe('/fares and /refunds with a live US city', () => {
  const city = {
    zone: 'TV', city: 'Treasure Valley', city_status: 'live', country: 'US', currency: 'USD',
    distance_unit: 'mi', tax_mode: 'exclusive', tax_label: 'Sales tax',
    vehicles: ['Standard', 'XL'].map((vehicle) => ({
      vehicle, base_fare: '2.50', per_distance: '1.60', per_minute: '0.30', minimum_fare: '7.00',
      night_multiplier: '1', night_hours: [22, 5] as [number, number],
      demand_band: { max_dynamic_multiplier: '1.5', min_dynamic_multiplier: '1' },
    })),
    cancellation: { percent: '10', cap_minor: 500, free_seconds: 120 },
  };

  it.each([['/fares', Fares], ['/refunds', Refunds]] as [string, ComponentType][])('%s shows dollars and miles only', async (path, Page) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { cities: [city] } }) })));
    const text = () => document.body.textContent ?? '';
    textOf(Page, 'US');
    if (path === '/fares') {
      await screen.findByTestId('fares-city');
      expect(text()).toMatch(/Per mile/);
      expect(text()).toMatch(/\$2\.50/);
    } else {
      await screen.findByText(/\$5/);
    }
    expect(hits(text())).toEqual([]);
  });
});
