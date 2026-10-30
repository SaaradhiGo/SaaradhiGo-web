/**
 * Revealable: a masked value, and the logged way to the real one.
 *
 * `fetch` is stubbed, so what is asserted is the request that leaves the
 * browser -- one target, the fields asked for, the reason only when one
 * was written -- and what the operator sees: the affordance only with
 * `pii.view`, the warning that the reveal is logged, the value swapped in
 * and tagged, the way back to masked, and a sentence for every refusal the
 * contract lists. Nothing revealed may land in storage or the URL.
 * Run with `npm test` (vitest, jsdom).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import type { AdminAccess } from '@/lib/adminScope';
import { resetRevealStatsForTests } from '@/lib/reveal';
import { Revealable } from './Revealable';
import SecurityPage from '@/app/(console)/settings/security/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/trips/42',
}));

let access: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => access };
});

const base: AdminAccess = {
  id: 7, email: 'ops@example.test', full_name: 'Ops One',
  is_superuser: false, is_break_glass: false,
  permissions: ['trip.read'], roles: [], scopes: [],
  access_model: 'assignments', super_admin_shortfall: 0,
};
const holder: AdminAccess = { ...base, permissions: ['trip.read', 'pii.view'] };

type Reply = { status: number; body: unknown };

const ok = (fields: Record<string, unknown>, inWindow = 3): Reply => ({
  status: 200,
  body: {
    status: 'success',
    data: { target_type: 'trip', target_id: 42, fields, audit_id: 900, reveals_in_window: inWindow },
  },
});
const refused = (status: number, code: string, message: string): Reply => ({
  status,
  body: { status: 'error', error: { code, message, field: 'general' } },
});

function serverAnswers(...queue: Reply[]) {
  const fetchMock = vi.fn(async () => {
    const r = queue.shift();
    if (!r) throw new Error('unexpected request: the queue of replies is empty');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function request(fetchMock: ReturnType<typeof vi.fn>, n: number) {
  const call = fetchMock.mock.calls[n] as unknown as [string, RequestInit] | undefined;
  if (!call) throw new Error(`no request #${n} was made`);
  const [url, init] = call;
  const headers = (init.headers ?? {}) as Record<string, string>;
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null, headers };
}

const MASKED = '+91••••••3210';
const REAL = '+919876543210';

function renderPhone(extra: Partial<React.ComponentProps<typeof Revealable>> = {}) {
  return render(
    <Revealable
      value={MASKED}
      label="rider phone"
      target={{ type: 'trip', id: 42 }}
      field="rider_phone"
      {...extra}
    />,
  );
}

async function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: 'Reveal rider phone' }));
  return screen.findByRole('dialog', { name: 'Reveal rider phone' });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  access = holder;
  resetRevealStatsForTests();
});

afterEach(() => {
  cleanup();
});

describe('who sees the affordance', () => {
  it('without pii.view the masked value is all there is', () => {
    access = base;
    renderPhone();
    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('when the access is unknown nothing is offered either', () => {
    access = null;
    renderPhone();
    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('with pii.view there is a Reveal beside the masked value', () => {
    renderPhone();
    expect(screen.getByText(MASKED)).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Reveal rider phone' });
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('a legacy unscoped account is served through the bridge and sees it too', () => {
    access = { ...base, access_model: 'legacy_unscoped' };
    renderPhone();
    expect(screen.getByRole('button', { name: 'Reveal rider phone' })).toBeTruthy();
  });
});

describe('confirming', () => {
  it('says the reveal is logged, asks for an optional reason, and sends exactly one target', async () => {
    const fetchMock = serverAnswers(ok({ rider_phone: REAL }));
    renderPhone();

    const dialog = await openPopover();
    expect(dialog.textContent).toContain('This reveal is logged with your name.');
    expect(screen.getByRole('button', { name: 'Reveal rider phone' }).getAttribute('aria-expanded')).toBe('true');
    const reason = screen.getByLabelText('Reason (optional)');
    await waitFor(() => expect(document.activeElement).toBe(reason));
    fireEvent.change(reason, { target: { value: 'payout dispute, ticket 881' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

    expect(await screen.findByText(REAL)).toBeTruthy();
    const r = request(fetchMock, 0);
    expect(r.method).toBe('POST');
    expect(r.url.endsWith('/admin-access/reveal/')).toBe(true);
    expect(r.headers.Authorization).toBe('Bearer access-1');
    expect(r.body).toEqual({
      target_type: 'trip', target_id: 42, fields: ['rider_phone'], reason: 'payout dispute, ticket 881',
    });
  });

  it('without a reason the body carries none', async () => {
    const fetchMock = serverAnswers(ok({ rider_phone: REAL }));
    renderPhone();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await screen.findByText(REAL);
    expect(request(fetchMock, 0).body).toEqual({ target_type: 'trip', target_id: 42, fields: ['rider_phone'] });
  });

  it('asks for every field in `fields` in the one call and shows the one named', async () => {
    const fetchMock = serverAnswers(ok({ rider_phone: REAL, rider_email: 'r@example.test' }));
    renderPhone({ fields: ['rider_phone', 'rider_email'] });
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await screen.findByText(REAL);
    expect(request(fetchMock, 0).body?.fields).toEqual(['rider_phone', 'rider_email']);
    expect(screen.queryByText('r@example.test')).toBeNull();
  });

  it('Enter in the reason field submits', async () => {
    const fetchMock = serverAnswers(ok({ rider_phone: REAL }));
    renderPhone();
    await openPopover();
    fireEvent.submit(screen.getByLabelText('Reason (optional)'));
    await screen.findByText(REAL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancel closes without a request and puts focus back on the trigger', async () => {
    const fetchMock = serverAnswers();
    renderPhone();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Reveal rider phone' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('Escape closes and returns focus to the trigger', async () => {
    serverAnswers();
    renderPhone();
    await openPopover();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Reveal rider phone' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('the trigger opens from the keyboard', async () => {
    serverAnswers();
    renderPhone();
    const trigger = screen.getByRole('button', { name: 'Reveal rider phone' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});

describe('after a reveal', () => {
  it('the value is swapped in, tagged as revealed and logged, announced, and can be masked again', async () => {
    serverAnswers(ok({ rider_phone: REAL }));
    renderPhone();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

    expect(await screen.findByText(REAL)).toBeTruthy();
    expect(screen.queryByText(MASKED)).toBeNull();
    expect(screen.getByText('revealed · logged')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Rider phone revealed. This reveal is logged with your name.');

    const hide = screen.getByRole('button', { name: 'Hide rider phone again' });
    await waitFor(() => expect(document.activeElement).toBe(hide));
    fireEvent.click(hide);

    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByText(REAL)).toBeNull();
    expect(screen.queryByText('revealed · logged')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Reveal rider phone' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('a custom renderer shows the revealed value its own way', async () => {
    serverAnswers(ok({ rider_phone: REAL }));
    renderPhone({ render: (v) => <a href={`tel:${String(v)}`}>{String(v)}</a> });
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    const link = await screen.findByRole('link', { name: REAL });
    expect(link.getAttribute('href')).toBe(`tel:${REAL}`);
  });

  it('a null value is said to be not on file rather than shown as nothing', async () => {
    serverAnswers(ok({ rider_phone: null }));
    renderPhone();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(await screen.findByText('Not on file')).toBeTruthy();
    expect(screen.getByText('revealed · logged')).toBeTruthy();
  });

  it('the revealed value is nowhere but on screen: not in storage, not in the URL', async () => {
    serverAnswers(ok({ rider_phone: REAL }));
    renderPhone();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await screen.findByText(REAL);

    const dump = (s: Storage) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`).join('\n');
    expect(dump(window.localStorage)).not.toContain(REAL);
    expect(dump(window.sessionStorage)).not.toContain(REAL);
    expect(dump(window.localStorage)).not.toContain('9876');
    expect(window.location.href).not.toContain('9876');
    expect(document.cookie).not.toContain('9876');
  });

  it('re-rendering with the same props does not forget the reveal; unmounting does', async () => {
    serverAnswers(ok({ rider_phone: REAL }), ok({ rider_phone: REAL }));
    const { rerender, unmount } = renderPhone();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await screen.findByText(REAL);
    rerender(<Revealable value={MASKED} label="rider phone" target={{ type: 'trip', id: 42 }} field="rider_phone" />);
    expect(screen.getByText(REAL)).toBeTruthy();
    unmount();
    renderPhone();
    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByText(REAL)).toBeNull();
  });
});

describe('refusals', () => {
  const cases: Array<[string, Reply, string]> = [
    ['403 without pii.view', refused(403, 'PERMISSION_DENIED', 'Forbidden.'),
      'You do not hold the permission to reveal personal data. Nothing was revealed.'],
    ['403 held elsewhere', refused(403, 'PII_VIEW_NOT_HELD_HERE', 'You do not hold pii.view where this record sits.'),
      'You hold the reveal permission elsewhere, not where this record sits. Nothing was revealed.'],
    ['404 out of scope', refused(404, 'NOT_FOUND', 'trip not found'),
      'This record is outside your scope, or no longer exists.'],
    ['409 incident closed', refused(409, 'SOS_NOT_ACTIVE', 'Contact details can only be revealed while the incident is open or acknowledged.'),
      'Contact details can only be revealed while the incident is open or acknowledged.'],
    ['429 too many', { status: 429, body: { detail: 'Request was throttled.' } },
      'Too many reveals in the last minute (the limit is 60). Wait a minute and try again.'],
    ['503 audit unavailable', refused(503, 'AUDIT_UNAVAILABLE', 'The reveal could not be logged, so nothing was revealed.'),
      'The reveal could not be logged, so nothing was revealed. Try again in a moment.'],
    ['400 unknown field, in the server\'s words', refused(400, 'UNKNOWN_FIELD', 'Unknown field(s) for trip: phone. Allowed: rider_name, rider_phone'),
      'Unknown field(s) for trip: phone. Allowed: rider_name, rider_phone'],
    ['400 bulk refused', refused(400, 'BULK_REVEAL_REFUSED', 'A reveal is one record at a time.'),
      'A reveal is one record at a time.'],
    ['a gateway failure with no body', { status: 502, body: null },
      'The reveal did not go through. Try again.'],
  ];

  for (const [name, reply, message] of cases) {
    it(`${name}: the popover stays open with the message, the value stays masked`, async () => {
      serverAnswers(reply);
      renderPhone();
      await openPopover();
      fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

      expect(await screen.findByText(message, { selector: 'p' })).toBeTruthy();
      expect(screen.getByRole('dialog')).toBeTruthy();
      expect(screen.getByText(MASKED)).toBeTruthy();
      expect(screen.queryByText('revealed · logged')).toBeNull();
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe(message);
      // 403/404/429/503 are not the session ending: the token stays.
      expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
    });
  }
});

describe('SOS', () => {
  function renderSos(active: boolean, reply?: Reply) {
    const fetchMock = serverAnswers(...(reply ? [reply] : []));
    render(
      <Revealable
        value={MASKED}
        label="caller phone for SOS #5"
        target={{ type: 'sos_event', id: 5 }}
        field="phone_number"
        disabledReason={active ? undefined : 'Contact can be revealed only while the incident is open or acknowledged.'}
      />,
    );
    return fetchMock;
  }

  it('an active incident reveals through the SOS door and shows the contact', async () => {
    const fetchMock = renderSos(true, {
      status: 200,
      body: { status: 'success', data: { sos_id: 5, status: 'open', contact: { user_label: 'Ravi K.', full_name: 'Ravi Kumar', phone_number: REAL, emergency_contact: null }, audit_id: 12 } },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal caller phone for SOS #5' }));
    fireEvent.change(await screen.findByLabelText('Reason (optional)'), { target: { value: 'calling back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));

    expect(await screen.findByText(REAL)).toBeTruthy();
    const r = request(fetchMock, 0);
    expect(r.method).toBe('POST');
    expect(r.url.endsWith('/sos/admin/5/reveal/')).toBe(true);
    expect(r.body).toEqual({ reason: 'calling back' });
  });

  it('a closed incident has the button disabled with the reason beside it, and nothing is sent', () => {
    const fetchMock = renderSos(false);
    const btn = screen.getByRole('button', { name: 'Reveal caller phone for SOS #5' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    const why = screen.getByText('Contact can be revealed only while the incident is open or acknowledged.');
    expect(btn.getAttribute('aria-describedby')).toBe(why.id);
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

describe('the Security page counter', () => {
  it('counts reveals this session and repeats the window count from the last response', async () => {
    serverAnswers(
      // The Security page asks for the MFA status first.
      { status: 200, body: { status: 'success', data: { mfa_enabled: false } } },
      ok({ rider_phone: REAL }, 7),
    );
    render(
      <>
        <SecurityPage />
        <Revealable value={MASKED} label="rider phone" target={{ type: 'trip', id: 42 }} field="rider_phone" />
      </>,
    );
    expect(await screen.findByText('Off in this environment')).toBeTruthy();
    expect(screen.getByTestId('reveals-session').textContent).toBe('0');
    expect(screen.queryByTestId('reveals-window')).toBeNull();
    expect(screen.getByText(/Each value you reveal is logged with your name/)).toBeTruthy();

    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    await screen.findByText(REAL);

    expect(screen.getByTestId('reveals-session').textContent).toBe('1');
    expect(screen.getByTestId('reveals-window').textContent).toContain('7 of 60 in the last minute');
  });
});
