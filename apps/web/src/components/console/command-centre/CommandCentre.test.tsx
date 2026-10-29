/**
 * The Command Centre, rendered in each of its states against a stubbed
 * server: loading, figures for two cities in two currencies, one city
 * chosen, empty, error with a working retry, forbidden, and an alert that
 * can be acknowledged by the operator who holds its capability.
 *
 * `fetch` is stubbed rather than the hooks, so what is asserted is what
 * the browser asked for and what the page did with the answer.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import type { CityRow, OperatorAlert } from '@/lib/commandCentre';
import { CITY_KEY, WINDOW_KEY } from '@/lib/commandCentre';
import { CommandCentre } from './CommandCentre';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const pair = (now: number | null, last: number | null = null) => ({ now, last_week: last });

function city(overrides: Partial<CityRow> & { code: string; name: string; country: string; currency: string; timezone: string }): CityRow {
  return {
    status: 'active',
    window: { key: '24h', start: '2026-10-27T01:30:00Z', end: '2026-10-28T01:30:00Z', last_week_start: '', last_week_end: '' },
    trips: { requested: pair(10, 5), accepted: pair(7, 4), completed: pair(6, 4), cancelled: pair(3, 1), unfulfilled: pair(2, 1) },
    rates: { unfulfilled_rate: pair(20, 20), acceptance_rate: pair(70, 80), avg_eta_minutes: pair(10, 6) },
    money: { collected: { [overrides.currency]: { now_minor: 210_000, last_week_minor: 40_000 } }, withdrawals_pending_sum: {} },
    drivers: { online_now: pair(1), online_source: 'db', active: pair(1, 1) },
    riders: { active_24h: pair(2, 1) },
    queues: {
      sos_open: pair(1), sos_oldest_open_minutes: 10, sos_raised: pair(1, 0),
      tickets_open: pair(1), tickets_raised: pair(1, 0),
      withdrawals_pending: pair(1), withdrawals_oldest_pending_hours: 60, withdrawals_requested: pair(1, 0),
      kyc_awaiting: pair(0), alerts_open: pair(2),
    },
    ...overrides,
  };
}

const HYD = city({ code: 'IN-TG-HYD', name: 'Hyderabad', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata' });
const AUS = city({
  code: 'US-TX-AUS', name: 'Austin', country: 'US', currency: 'USD', timezone: 'America/Chicago', status: 'paused',
  trips: { requested: pair(4, 0), accepted: pair(2, 0), completed: pair(2, 0), cancelled: pair(2, 0), unfulfilled: pair(2, 0) },
  rates: { unfulfilled_rate: pair(50, null), acceptance_rate: pair(50, null), avg_eta_minutes: pair(8, null) },
  money: { collected: { USD: { now_minor: 4_000, last_week_minor: 0 } }, withdrawals_pending_sum: { USD: { now_minor: 5_000, last_week_minor: null } } },
});
const EMPTY_CITY = city({
  code: 'IN-TG-WGL', name: 'Warangal', country: 'IN', currency: 'INR', timezone: 'Asia/Kolkata',
  trips: { requested: pair(0, 0), accepted: pair(0, 0), completed: pair(0, 0), cancelled: pair(0, 0), unfulfilled: pair(0, 0) },
  rates: { unfulfilled_rate: pair(null, null), acceptance_rate: pair(null, null), avg_eta_minutes: pair(null, null) },
  money: { collected: {}, withdrawals_pending_sum: {} },
  queues: {
    sos_open: pair(0), sos_oldest_open_minutes: 0, sos_raised: pair(0, 0), tickets_open: pair(0), tickets_raised: pair(0, 0),
    withdrawals_pending: pair(0), withdrawals_oldest_pending_hours: 0, withdrawals_requested: pair(0, 0), kyc_awaiting: pair(0), alerts_open: pair(0),
  },
});

const rateAlert: OperatorAlert = {
  id: 11, kind: 'threshold_unfulfilled_rate', severity: 'warning',
  title: 'Hyderabad: Unfulfilled-request rate 20% (above 15%, warning)',
  payload: { city: 'IN-TG-HYD', city_name: 'Hyderabad', metric: 'unfulfilled_rate', metric_label: 'Unfulfilled-request rate', unit: 'percent', value: 20, threshold: '15', window: '24h' },
  source_type: 'alert_threshold', source_id: 'IN-TG-HYD:unfulfilled_rate', city: 'IN-TG-HYD', city_name: 'Hyderabad',
  created_at: '2026-10-28T01:00:00Z', acknowledged_at: null, acknowledged_by: null, acknowledged_note: '', ack_permission: 'trip.write',
};
const payoutAlert: OperatorAlert = {
  ...rateAlert, id: 12, kind: 'threshold_withdrawal_pending', severity: 'warning',
  title: 'Hyderabad: Oldest pending withdrawal 60 h', ack_permission: 'finance.read',
  payload: { city: 'IN-TG-HYD', city_name: 'Hyderabad', metric: 'withdrawal_pending', metric_label: 'Oldest pending withdrawal', unit: 'hours', value: 60, threshold: '48', window: 'now' },
};
const sosAlert: OperatorAlert = {
  ...rateAlert, id: 13, kind: 'threshold_sos_open', severity: 'critical', title: 'Hyderabad: Open SOS 1', ack_permission: 'safety.respond',
  payload: { city: 'IN-TG-HYD', city_name: 'Hyderabad', metric: 'sos_open', metric_label: 'Open SOS', unit: 'count', value: 1, threshold: '0', window: 'now' },
};

const cityOps: AdminAccess = {
  id: 1, email: 'ops@saaradhigo.test', full_name: 'Ops', is_superuser: false, is_break_glass: false,
  permissions: ['trip.read', 'trip.write', 'driver.read', 'support.read', 'report.read', 'finance.read', 'safety.respond'],
  roles: [], scopes: [{ code: 'IN-TG-HYD', name: 'Hyderabad', kind: 'city', status: 'active', depth: 3 }],
  access_model: 'assignments', super_admin_shortfall: 0,
};

type Reply = { status: number; body: unknown };
const ok = (data: unknown): Reply => ({ status: 200, body: { status: 'success', data } });
const overviewOf = (cities: CityRow[]) => ok({ window: '24h', generated_at: 'x', scope: null, money_visible: true, definitions: {}, cities });
const alertsOf = (results: OperatorAlert[]) => ok({ count: results.length, open_count: results.length, limit: 50, offset: 0, results });
const trips = ok({ count: 0, results: [] });

function server(routes: { overview?: (url: string) => Reply; alerts?: (url: string) => Reply; trips?: Reply; ack?: Reply }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    let r: Reply | undefined;
    if (url.includes('/acknowledge/')) r = routes.ack ?? ok(rateAlert);
    else if (url.includes('/command-centre/admin/overview/')) r = routes.overview?.(url);
    else if (url.includes('/command-centre/admin/alerts/')) r = routes.alerts?.(url);
    else if (url.includes('/ride/admin/trips/')) r = routes.trips ?? trips;
    if (!r) {
      // A route a test did not provide hangs, which is what "still loading" is.
      return new Promise<never>(() => {});
    }
    void init;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.localStorage.removeItem(CITY_KEY);
  window.localStorage.removeItem(WINDOW_KEY);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('loading', () => {
  it('draws skeletons for the figures and the alerts, and announces it', () => {
    server({});
    render(<CommandCentre access={cityOps} />);
    expect(screen.getByTestId('overview-loading').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading the figures')).toBeTruthy();
    expect(screen.getByText('Loading alerts')).toBeTruthy();
    expect(screen.getByText('Loading the latest trips')).toBeTruthy();
  });
});

describe('ready', () => {
  it('shows every city with its money in its own currency, never combined', async () => {
    server({ overview: () => overviewOf([HYD, AUS]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={cityOps} />);
    await screen.findByRole('heading', { name: /Hyderabad/ });
    expect(screen.getByRole('heading', { name: /Austin/ })).toBeTruthy();
    expect(screen.getByText('₹2,100.00')).toBeTruthy();
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.queryByText(/₹.*\$|\$.*₹/)).toBeNull();
    // Rates and their deltas: 20.0 % unfulfilled, unchanged; acceptance down 10 points.
    expect(screen.getAllByText('20.0%').length).toBeGreaterThan(0);
    expect(screen.getByText(/▼ 10\.0 pp/)).toBeTruthy();
    expect(screen.getAllByText(/vs same 24 h last week/).length).toBeGreaterThan(5);
    // Austin's last week was empty, so its rates carry no trend and say so.
    const austin = screen.getByRole('region', { name: /Austin/ });
    expect(within(austin).getAllByText('50.0%')).toHaveLength(2); // unfulfilled and acceptance, both 2 of 4
    expect(within(austin).queryAllByText('No requests in this window')).toHaveLength(0);
    expect(screen.getByText('No open alerts')).toBeTruthy();
    // The selector offers both cities and "All cities".
    const select = screen.getByLabelText('City') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['All cities', 'Hyderabad', 'Austin (paused)']);
  });

  it('narrows to one city and remembers it; the window toggle is announced', async () => {
    const fetchMock = server({ overview: () => overviewOf([HYD, AUS]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={cityOps} />);
    await screen.findByRole('heading', { name: /Hyderabad/ });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'US-TX-AUS' } });
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Hyderabad/ })).toBeNull());
    expect(screen.getByRole('heading', { name: /Austin/ })).toBeTruthy();
    expect(window.localStorage.getItem(CITY_KEY)).toBe('US-TX-AUS');
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('overview/?window=today&scope=US-TX-AUS'))).toBe(true));

    const today = screen.getByRole('button', { name: 'Today' });
    const week = screen.getByRole('button', { name: '7 d' });
    expect(today.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(week);
    expect(week.getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(WINDOW_KEY)).toBe('7d');
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('window=7d'))).toBe(true));
  });

  it('renders a single-city operator with a label, not a select', async () => {
    server({ overview: () => overviewOf([HYD]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={cityOps} />);
    await screen.findByRole('heading', { name: /Hyderabad/ });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Hyderabad', { selector: 'b' })).toBeTruthy();
  });

  it('counts only the queues the caller is shown', async () => {
    server({ overview: () => overviewOf([HYD]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={cityOps} />);
    expect(await screen.findByText(/3 items waiting on you/)).toBeTruthy();
  });

  it('tells a reports-only caller no queue is theirs, and counts none', async () => {
    const reportsOnly: AdminAccess = { ...cityOps, permissions: ['report.read'] };
    server({ overview: () => overviewOf([HYD]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={reportsOnly} />);
    expect(await screen.findByText(/0 items waiting on you/)).toBeTruthy();
    expect(screen.getByText('No work queues are part of your access.')).toBeTruthy();
  });
});

describe('empty', () => {
  it('says there is no data in the window rather than drawing zeroes as rates', async () => {
    server({ overview: () => overviewOf([EMPTY_CITY]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={cityOps} />);
    await screen.findByRole('heading', { name: /Warangal/ });
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('No requests in this window').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.0%')).toBeNull();
    expect(screen.getByText('No open alerts')).toBeTruthy();
    expect(await screen.findByText('No trips in this window')).toBeTruthy();
  });

  it('says when no city is in scope at all', async () => {
    server({ overview: () => overviewOf([]), alerts: () => alertsOf([]) });
    render(<CommandCentre access={cityOps} />);
    expect(await screen.findByText('No cities in your scope')).toBeTruthy();
  });
});

describe('error', () => {
  it('offers to try again, and does', async () => {
    let calls = 0;
    server({
      overview: () => {
        calls += 1;
        return calls === 1 ? { status: 502, body: null } : overviewOf([HYD]);
      },
      alerts: () => ({ status: 500, body: { error: { code: 'X', message: 'Alerts are down.' } } }),
    });
    render(<CommandCentre access={cityOps} />);
    expect(await screen.findByText('The figures could not be loaded')).toBeTruthy();
    expect(screen.getByText('Alerts could not be loaded')).toBeTruthy();
    expect(screen.getByText('Alerts are down.')).toBeTruthy();
    const retry = screen.getAllByRole('button', { name: 'Try again' })[0];
    fireEvent.click(retry);
    await screen.findByRole('heading', { name: /Hyderabad/ });
    expect(screen.queryByText('The figures could not be loaded')).toBeNull();
  });
});

describe('forbidden', () => {
  it('hides each refused panel behind one line', async () => {
    const refused: Reply = { status: 403, body: { error: { code: 'FORBIDDEN', message: 'No.' } } };
    server({ overview: () => refused, alerts: () => refused, trips: refused });
    render(<CommandCentre access={cityOps} />);
    expect(await screen.findByText('The city figures are not part of your access.')).toBeTruthy();
    expect(await screen.findByText('Alerts are not part of your access.')).toBeTruthy();
    expect(await screen.findByText('Trips are not part of your access.')).toBeTruthy();
    expect(screen.queryByLabelText('City')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('alerts', () => {
  it('lists severity, city, value against the line, and an Acknowledge button only for the holder', async () => {
    const fetchMock = server({
      overview: () => overviewOf([HYD]),
      alerts: () => alertsOf([sosAlert, rateAlert, payoutAlert]),
    });
    const opsWithoutFinance: AdminAccess = { ...cityOps, permissions: cityOps.permissions.filter((p) => p !== 'finance.read' && p !== 'safety.respond') };
    render(<CommandCentre access={opsWithoutFinance} />);
    await screen.findByText('Alerts · 3 open');
    expect(await screen.findByText('3 open alerts')).toBeTruthy(); // the live region
    expect(screen.getByText('20% vs 15% line')).toBeTruthy();
    expect(screen.getByText('60 h vs 48 h line')).toBeTruthy();
    expect(screen.getByText('critical')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: /^Acknowledge alert/ });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toContain('Unfulfilled-request rate');
    expect(screen.getByText('for finance')).toBeTruthy();
    expect(screen.getByText('for safety')).toBeTruthy();

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/command-centre/admin/alerts/11/acknowledge/'))).toBe(true));
    const ack = fetchMock.mock.calls.find((c) => String(c[0]).includes('/acknowledge/')) as unknown as [string, RequestInit];
    expect(ack[1].method).toBe('POST');
  });
});
