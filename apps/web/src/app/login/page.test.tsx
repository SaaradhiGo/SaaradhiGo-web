/**
 * Staff sign-in: the forced password change rides on the sign-in request.
 *
 * `/auth/admin/login/` answers a temporary password with 401
 * `AUTH_PASSWORD_CHANGE_REQUIRED` and issues NO token, so there is nothing
 * to call `/auth/password/change/` with. The screen used to try exactly
 * that, which meant an operator created with `create_operator` could never
 * get in. The only way through is the same sign-in again with
 * `new_password` added -- plus whatever the earlier gates asked for, since
 * the server checks credentials, then the second factor, then the
 * break-glass reason, then the password, in that order.
 *
 * `fetch` is stubbed rather than the API helper, so what is asserted is
 * the request that leaves the browser: its path, its body and the absence
 * of a bearer token. Run with `npm test` (vitest, jsdom).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_USER_KEY, TOKEN_KEY } from '@/lib/api';
import LoginPage from './page';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const EMAIL = 'ops@saaradhigo.test';
const TEMP_PASSWORD = 'temporary-temporary';
const CHOSEN = 'chosen-chosen-chosen';
const SECOND_CHOICE = 'another-another-one';

type Reply = { status: number; body: unknown };

const mfaRequired: Reply = {
  status: 401,
  body: { error: { code: 'AUTH_MFA_REQUIRED', message: 'An authentication code is required', field: 'mfa_code' } },
};
const changeRequired: Reply = {
  status: 401,
  body: { error: { code: 'AUTH_PASSWORD_CHANGE_REQUIRED', message: 'Choose a new password to finish signing in.', field: 'new_password' } },
};
const weak: Reply = {
  status: 400,
  body: { error: { code: 'AUTH_PASSWORD_WEAK', message: 'The new password must be different from the temporary one.', field: 'new_password' } },
};
const refusedReply: Reply = {
  status: 401,
  body: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' } },
};
const signedIn: Reply = {
  status: 200,
  body: { status: 'success', data: { token: 'access-1', refresh_token: 'refresh-1', user: { email: EMAIL, role: 'ops' } } },
};

/** Answers requests in order; a request past the end of the queue fails the test. */
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
  return { url, body: JSON.parse(String(init.body)) as Record<string, unknown>, headers };
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: EMAIL } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: TEMP_PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function submitNewPassword(value = CHOSEN) {
  const field = await screen.findByLabelText('New password');
  fireEvent.change(field, { target: { value } });
  fireEvent.change(screen.getByLabelText('New password again'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password and continue' }));
}

async function enterCode(digits: string) {
  // Six digits submit on their own; there is no second gesture.
  const field = await screen.findByLabelText('Authenticator code');
  fireEvent.change(field, { target: { value: digits } });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('forced password change at sign-in', () => {
  it('a temporary password opens the new-password step and stores no token', async () => {
    const fetchMock = serverAnswers(changeRequired);
    render(<LoginPage />);
    submitCredentials();

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy();
    expect(screen.getByLabelText('New password')).toBeTruthy();
    // The temporary password was typed a step ago; it is not asked for again.
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends the new password on the same sign-in request, never to the change endpoint, then signs in', async () => {
    const fetchMock = serverAnswers(changeRequired, signedIn);
    render(<LoginPage />);
    submitCredentials();
    await submitNewPassword();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = request(fetchMock, 0);
    const second = request(fetchMock, 1);
    for (const r of [first, second]) {
      expect(r.url.endsWith('/auth/admin/login/')).toBe(true);
      expect(r.url.includes('/auth/password/change/')).toBe(false);
      expect(r.headers.Authorization).toBeUndefined();
    }
    expect(first.body).toEqual({ email: EMAIL, password: TEMP_PASSWORD });
    expect(second.body).toEqual({ email: EMAIL, password: TEMP_PASSWORD, new_password: CHOSEN });

    // The normal sign-in path: the session is stored exactly as a plain 200 would store it.
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
    expect(JSON.parse(window.localStorage.getItem(ADMIN_USER_KEY) ?? 'null')).toMatchObject({ email: EMAIL });
  });

  it('a weak choice keeps the step open with the server\'s reason, and the next choice goes through', async () => {
    const fetchMock = serverAnswers(changeRequired, weak, signedIn);
    render(<LoginPage />);
    submitCredentials();
    await submitNewPassword();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The new password must be different from the temporary one.');
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();

    await submitNewPassword(SECOND_CHOICE);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(request(fetchMock, 2).body).toEqual({
      email: EMAIL, password: TEMP_PASSWORD, new_password: SECOND_CHOICE,
    });
  });

  it('mismatched or unchanged passwords are refused locally, without a request', async () => {
    const fetchMock = serverAnswers(changeRequired);
    render(<LoginPage />);
    submitCredentials();

    const field = await screen.findByLabelText('New password');
    fireEvent.change(field, { target: { value: CHOSEN } });
    fireEvent.change(screen.getByLabelText('New password again'), { target: { value: 'different-different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password and continue' }));
    expect((await screen.findByRole('alert')).textContent).toContain('do not match');

    fireEvent.change(field, { target: { value: TEMP_PASSWORD } });
    fireEvent.change(screen.getByLabelText('New password again'), { target: { value: TEMP_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password and continue' }));
    expect((await screen.findByRole('alert')).textContent).toContain('different from the temporary one');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('second factor first, then the password change: the final resend carries both', async () => {
    const fetchMock = serverAnswers(mfaRequired, changeRequired, signedIn);
    render(<LoginPage />);
    submitCredentials();
    await enterCode('123456');
    await submitNewPassword();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(request(fetchMock, 0).body).toEqual({ email: EMAIL, password: TEMP_PASSWORD });
    expect(request(fetchMock, 1).body).toEqual({ email: EMAIL, password: TEMP_PASSWORD, mfa_code: '123456' });
    expect(request(fetchMock, 2).body).toEqual({
      email: EMAIL, password: TEMP_PASSWORD, mfa_code: '123456', new_password: CHOSEN,
    });
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
  });

  it('asked for a code again at the password step, it shows the code field and resends both', async () => {
    const fetchMock = serverAnswers(changeRequired, mfaRequired, signedIn);
    render(<LoginPage />);
    submitCredentials();
    await submitNewPassword();
    await enterCode('246810');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(request(fetchMock, 2).body).toEqual({
      email: EMAIL, password: TEMP_PASSWORD, mfa_code: '246810', new_password: CHOSEN,
    });
  });

  it('a code that expired while the password was being chosen goes back to the code and keeps the choice', async () => {
    const fetchMock = serverAnswers(mfaRequired, changeRequired, refusedReply, signedIn);
    render(<LoginPage />);
    submitCredentials();
    await enterCode('123456');
    await submitNewPassword();

    expect((await screen.findByRole('alert')).textContent).toContain('That code has expired');
    expect(replace).not.toHaveBeenCalled();

    await enterCode('654321');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(request(fetchMock, 3).body).toEqual({
      email: EMAIL, password: TEMP_PASSWORD, mfa_code: '654321', new_password: CHOSEN,
    });
  });
});
