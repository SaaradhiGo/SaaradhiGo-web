/**
 * Security page: MFA status and recovery-code regeneration.
 *
 * `fetch` is stubbed, so what is asserted is the request that leaves the
 * browser -- the status GET and the regenerate POST, both with the console's
 * bearer token -- and the screen the operator sees: the status facts, the
 * live-code prompt, the show-once list, and the return to status with the
 * codes gone. Run with `npm test` (vitest, jsdom).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOVERY_LOW_KEY, TOKEN_KEY } from '@/lib/api';
import SecurityPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/settings/security',
}));

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const CODES = ['k3q7m2x9', 'p8w2n5zb', 'c6r4t1hd', 'y2m9q7ka', 'f5x3v8je',
  'h7b2s4nr', 'z1k6p9tw', 'q4d8m3cs', 'w9n2r7xb', 'j6t1h5pk'];

type Reply = { status: number; body: unknown };

const status = (data: Record<string, unknown>): Reply => ({
  status: 200,
  body: {
    status: 'success',
    data: {
      mfa_enabled: true, enrolled: true, pending: false,
      recovery_codes_remaining: 10, recovery_codes_low: false, ...data,
    },
  },
});
const issued: Reply = {
  status: 200,
  body: {
    status: 'success',
    data: {
      recovery_codes: CODES, recovery_codes_notice: 'Save these recovery codes somewhere safe now.',
      recovery_codes_remaining: 10, recovery_codes_low: false,
    },
  },
};
const wrongCode: Reply = {
  status: 403,
  body: { error: { code: 'AUTH_INVALID_CODE', message: 'That code did not work.', field: 'mfa_code' } },
};
const disabled: Reply = {
  status: 409,
  body: { error: { code: 'MFA_DISABLED', message: 'Multi-factor authentication is switched off in this environment, so recovery codes are not in use.' } },
};

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

async function startRegenerate() {
  fireEvent.click(await screen.findByRole('button', { name: 'Regenerate recovery codes' }));
  return screen.findByLabelText('Authenticator code');
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
});

afterEach(() => {
  cleanup();
});

describe('status', () => {
  it('asks the status endpoint with the bearer token and shows the facts', async () => {
    const fetchMock = serverAnswers(status({ recovery_codes_remaining: 7 }));
    render(<SecurityPage />);

    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(screen.getByTestId('recovery-remaining').textContent).toBe('7');
    expect(screen.queryByText('Low')).toBeNull();
    const r = request(fetchMock, 0);
    expect(r.url.endsWith('/auth/admin/mfa/status/')).toBe(true);
    expect(r.headers.Authorization).toBe('Bearer access-1');
    expect(screen.getByRole('button', { name: 'Regenerate recovery codes' })).toBeTruthy();
  });

  it('flags a low count', async () => {
    serverAnswers(status({ recovery_codes_remaining: 1, recovery_codes_low: true }));
    render(<SecurityPage />);

    expect(await screen.findByText('Low')).toBeTruthy();
    expect(screen.getByTestId('recovery-remaining').textContent).toBe('1');
  });

  it('a pending authenticator is said to be unconfirmed, and there is nothing to regenerate yet', async () => {
    serverAnswers(status({ enrolled: false, pending: true, recovery_codes_remaining: 0, recovery_codes_low: true }));
    render(<SecurityPage />);

    expect(await screen.findByText('Set up, not yet confirmed')).toBeTruthy();
    expect(screen.getByText(/issued then and shown once/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Regenerate recovery codes' })).toBeNull();
    // Zero codes before enrolment is not a "low" warning.
    expect(screen.queryByText('Low')).toBeNull();
  });

  it('with the switch off it says so and offers no regeneration', async () => {
    serverAnswers(status({ mfa_enabled: false }));
    render(<SecurityPage />);

    expect(await screen.findByText('Off in this environment')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Regenerate recovery codes' })).toBeNull();
  });

  it('a failed load is an error with a retry, not a page of zeroes', async () => {
    const fetchMock = serverAnswers({ status: 502, body: null }, status({}));
    render(<SecurityPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Sign-in settings unavailable');
    expect(screen.queryByTestId('recovery-remaining')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Enrolled')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('regenerating', () => {
  it('asks for a live authenticator code, posts it with the token, shows the new set once, then returns to status', async () => {
    const fetchMock = serverAnswers(status({ recovery_codes_remaining: 2, recovery_codes_low: true }), issued, status({}));
    window.sessionStorage.setItem(RECOVERY_LOW_KEY, '2');
    render(<SecurityPage />);

    const field = await startRegenerate();
    expect(screen.getByRole('heading', { name: 'Confirm it is you' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    fireEvent.change(field, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue new codes' }));

    await screen.findByTestId('recovery-codes-screen');
    const r = request(fetchMock, 1);
    expect(r.method).toBe('POST');
    expect(r.url.endsWith('/auth/admin/mfa/recovery-codes/regenerate/')).toBe(true);
    expect(r.headers.Authorization).toBe('Bearer access-1');
    expect(r.body).toEqual({ mfa_code: '123456' });

    expect(screen.getByRole('heading', { name: 'Your new recovery codes' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Recovery codes' });
    expect(Array.from(list.querySelectorAll('li code')).map((el) => el.textContent)).toEqual(CODES);
    // A fresh set is not low: the sign-in's note is cleared.
    expect(window.sessionStorage.getItem(RECOVERY_LOW_KEY)).toBeNull();

    // Confirmation required, then the codes are gone and the status is re-read.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Tick the box');
    fireEvent.click(screen.getByLabelText('I have saved these codes somewhere safe'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByTestId('recovery-codes-screen')).toBeNull());
    for (const code of CODES) expect(screen.queryByText(code)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(request(fetchMock, 2).url.endsWith('/auth/admin/mfa/status/')).toBe(true);
    expect(await screen.findByRole('button', { name: 'Regenerate recovery codes' })).toBeTruthy();
  });

  it('six digits are required before anything is sent', async () => {
    const fetchMock = serverAnswers(status({}));
    render(<SecurityPage />);

    const field = await startRegenerate();
    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue new codes' }));

    expect((await screen.findByRole('alert')).textContent).toContain('all six digits');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a wrong code keeps the prompt open with a message, clears the field, and does not sign the operator out', async () => {
    serverAnswers(status({}), wrongCode);
    render(<SecurityPage />);

    const field = await startRegenerate();
    fireEvent.change(field, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue new codes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('That code did not work');
    expect((screen.getByLabelText('Authenticator code') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Authenticator code').getAttribute('aria-invalid')).toBe('true');
    // 403, not 401: the token is still there.
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
  });

  it('a server refusal with its own words shows those words', async () => {
    serverAnswers(status({}), disabled);
    render(<SecurityPage />);

    const field = await startRegenerate();
    fireEvent.change(field, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue new codes' }));

    expect((await screen.findByRole('alert')).textContent).toContain('switched off in this environment');
  });

  it('cancel returns to the status without a request', async () => {
    const fetchMock = serverAnswers(status({}));
    render(<SecurityPage />);

    await startRegenerate();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Authenticator code')).toBeNull();
    const regen = await screen.findByRole('button', { name: 'Regenerate recovery codes' });
    await waitFor(() => expect(document.activeElement).toBe(regen));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
