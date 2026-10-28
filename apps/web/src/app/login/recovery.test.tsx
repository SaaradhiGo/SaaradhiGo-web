/**
 * Staff sign-in: recovery codes (go-live blocker #6).
 *
 * The "use a recovery code" step used to post the code as `mfa_code`, and
 * the first sign-in that confirmed an authenticator issued no codes at
 * all, so a lost authenticator was a lockout. Asserted here, against the
 * requests that leave the browser and the DOM the operator sees:
 *
 *   * the recovery step sends `recovery_code` and never `mfa_code`;
 *   * a low count after sign-in is noted for the console to show;
 *   * the codes the server returns ONCE are shown once: the screen will
 *     not let go until the operator confirms, and after it lets go the
 *     codes are gone from the page;
 *   * the pieces a screen reader depends on: labels, focus, live regions.
 *
 * Run with `npm test` (vitest, jsdom).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOVERY_LOW_KEY, TOKEN_KEY } from '@/lib/api';
import { RecoveryLowBanner } from '@/components/console/RecoveryLowBanner';
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
const PASSWORD = 'a-real-password-here';
const CODES = ['k3q7m2x9', 'p8w2n5zb', 'c6r4t1hd', 'y2m9q7ka', 'f5x3v8je',
  'h7b2s4nr', 'z1k6p9tw', 'q4d8m3cs', 'w9n2r7xb', 'j6t1h5pk'];

type Reply = { status: number; body: unknown };

const mfaRequired: Reply = {
  status: 401,
  body: { error: { code: 'AUTH_MFA_REQUIRED', message: 'An authentication code is required', field: 'mfa_code' } },
};
const refused: Reply = {
  status: 401,
  body: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid credentials' } },
};
const signedIn = (extra: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { status: 'success', data: { token: 'access-1', refresh_token: 'refresh-1', user: { email: EMAIL }, ...extra } },
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
  return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

function submitCredentials() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: EMAIL } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function switchToRecovery() {
  await screen.findByLabelText('Authenticator code');
  fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code instead' }));
  return screen.findByLabelText('Recovery code');
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  replace.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('signing in with a recovery code', () => {
  it('the link swaps the six-digit field for a recovery-code field, with a hint, and focuses it', async () => {
    serverAnswers(mfaRequired);
    render(<LoginPage />);
    submitCredentials();

    const field = await switchToRecovery();

    expect(screen.getByRole('heading', { name: 'Use a recovery code' })).toBeTruthy();
    expect(screen.queryByLabelText('Authenticator code')).toBeNull();
    expect(field.getAttribute('name')).toBe('recovery_code');
    expect(field.getAttribute('autocomplete')).toBe('off');
    // The hint is tied to the field, not just near it.
    const hint = document.getElementById(field.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toContain('Eight letters and numbers');
    await waitFor(() => expect(document.activeElement).toBe(field));
    // And the way back.
    expect(screen.getByRole('button', { name: 'Use the authenticator instead' })).toBeTruthy();
  });

  it('sends the code as recovery_code, never as mfa_code, and signs in', async () => {
    const fetchMock = serverAnswers(mfaRequired, signedIn({ recovery_codes_remaining: 7, recovery_codes_low: false }));
    render(<LoginPage />);
    submitCredentials();

    const field = await switchToRecovery();
    fireEvent.change(field, { target: { value: ' K3Q7-M2X9 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = request(fetchMock, 1);
    expect(second.url.endsWith('/auth/admin/login/')).toBe(true);
    expect(second.body).toEqual({ email: EMAIL, password: PASSWORD, recovery_code: 'K3Q7-M2X9' });
    expect('mfa_code' in second.body).toBe(false);
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
    // Seven left is not low: nothing noted for the console.
    expect(window.sessionStorage.getItem(RECOVERY_LOW_KEY)).toBeNull();
  });

  it('a short paste is refused locally, with a specific message and no request', async () => {
    const fetchMock = serverAnswers(mfaRequired);
    render(<LoginPage />);
    submitCredentials();

    const field = await switchToRecovery();
    fireEvent.change(field, { target: { value: 'k3q7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect((await screen.findByRole('alert')).textContent).toContain('whole recovery code');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a refused recovery code says so without naming which part failed, and clears the field', async () => {
    serverAnswers(mfaRequired, refused);
    render(<LoginPage />);
    submitCredentials();

    const field = await switchToRecovery();
    fireEvent.change(field, { target: { value: 'notarealcode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('That recovery code did not work');
    expect((screen.getByLabelText('Recovery code') as HTMLInputElement).value).toBe('');
    expect(replace).not.toHaveBeenCalled();
  });

  it('a low count after sign-in is noted, and the console banner says so with the way to fix it', async () => {
    serverAnswers(mfaRequired, signedIn({ recovery_codes_remaining: 2, recovery_codes_low: true }));
    render(<LoginPage />);
    submitCredentials();
    const field = await switchToRecovery();
    fireEvent.change(field, { target: { value: CODES[0] } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(window.sessionStorage.getItem(RECOVERY_LOW_KEY)).toBe('2');
    cleanup();

    // What the shell shows on the first console page.
    render(<RecoveryLowBanner />);
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Only 2 recovery codes left');
    const link = screen.getByRole('link', { name: 'Regenerate them in Security' });
    expect(link.getAttribute('href')).toBe('/settings/security');

    // Dismissed once, gone for the session.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this notice' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(window.sessionStorage.getItem(RECOVERY_LOW_KEY)).toBeNull();
  });

  it('the banner is silent when nothing was noted', () => {
    render(<RecoveryLowBanner />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('the recovery codes, shown once at the first sign-in', () => {
  async function signInAndReachTheCodes(extra: Record<string, unknown> = {}) {
    const fetchMock = serverAnswers(mfaRequired, signedIn({
      recovery_codes: CODES,
      recovery_codes_notice: 'Save these recovery codes somewhere safe now.',
      recovery_codes_remaining: 10,
      recovery_codes_low: false,
      ...extra,
    }));
    render(<LoginPage />);
    submitCredentials();
    const field = await screen.findByLabelText('Authenticator code');
    fireEvent.change(field, { target: { value: '123456' } });
    await screen.findByTestId('recovery-codes-screen');
    return fetchMock;
  }

  it('shows every code in a monospace list, with the server\'s notice, and does not leave yet', async () => {
    await signInAndReachTheCodes();

    expect(screen.getByRole('heading', { name: 'Save your recovery codes' })).toBeTruthy();
    expect(screen.getByText('Save these recovery codes somewhere safe now.')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Recovery codes' });
    const items = list.querySelectorAll('li code');
    expect(Array.from(items).map((el) => el.textContent)).toEqual(CODES);
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download .txt' })).toBeTruthy();
    // Signed in -- the token is stored -- but the console waits.
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('access-1');
    expect(replace).not.toHaveBeenCalled();
  });

  it('moves focus to the heading so the change of screen is announced', async () => {
    await signInAndReachTheCodes();
    const heading = screen.getByRole('heading', { name: 'Save your recovery codes' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('will not continue until the operator confirms the codes are saved', async () => {
    await signInAndReachTheCodes();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to the console' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Tick the box');
    expect(replace).not.toHaveBeenCalled();
    // Still there: nothing was lost by pressing the button early.
    expect(screen.getByText(CODES[0])).toBeTruthy();
  });

  it('after the confirmation the codes are gone from the page and the console opens', async () => {
    await signInAndReachTheCodes();

    fireEvent.click(screen.getByLabelText('I have saved these codes somewhere safe'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to the console' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByTestId('recovery-codes-screen')).toBeNull();
    for (const code of CODES) expect(screen.queryByText(code)).toBeNull();
    // Nowhere in the browser either: not in storage, so not reachable by a reload.
    const everything = JSON.stringify({ ...window.localStorage, ...window.sessionStorage });
    for (const code of CODES) expect(everything.includes(code)).toBe(false);
  });

  it('copy-all puts the codes on the clipboard, one per line, and says so in a live region', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await signInAndReachTheCodes();

    fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODES.join('\n')));
    const statuses = screen.getAllByRole('status');
    const feedback = statuses.find((el) => el.getAttribute('aria-live') === 'polite');
    await waitFor(() => expect(feedback?.textContent).toContain('Copied 10 codes'));
  });

  it('download builds the file in the browser from a Blob and sends nothing', async () => {
    const fetchMock = await signInAndReachTheCodes();
    const create = vi.fn(() => 'blob:fake');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Download .txt' }));

    expect(create).toHaveBeenCalledTimes(1);
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/plain');
    // jsdom's Blob has no text(); read it the way a browser of 2015 would.
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(content).toContain(CODES.join('\n'));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    // Two sign-in requests and nothing else left the browser.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it('an ordinary sign-in -- no codes in the reply -- goes straight to the console', async () => {
    serverAnswers(mfaRequired, signedIn());
    render(<LoginPage />);
    submitCredentials();
    const field = await screen.findByLabelText('Authenticator code');
    fireEvent.change(field, { target: { value: '123456' } });

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(screen.queryByTestId('recovery-codes-screen')).toBeNull();
  });
});

describe('accessibility of the sign-in steps', () => {
  it('every field has a label and the error is an alert', async () => {
    serverAnswers(mfaRequired, refused);
    render(<LoginPage />);
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    submitCredentials();

    const totp = await screen.findByLabelText('Authenticator code');
    expect(totp.getAttribute('aria-describedby')).toBe('login-code-hint');
    await waitFor(() => expect(document.activeElement).toBe(totp));

    const recovery = await switchToRecovery();
    fireEvent.change(recovery, { target: { value: 'notarealcode' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByLabelText('Recovery code').getAttribute('aria-invalid')).toBe('true');
  });

  it('the focus order on the recovery step is field, continue, then the two links', async () => {
    serverAnswers(mfaRequired);
    render(<LoginPage />);
    submitCredentials();
    const field = await switchToRecovery();

    const form = field.closest('form') as HTMLFormElement;
    const focusable = Array.from(form.querySelectorAll<HTMLElement>('input, button, a'))
      .filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);
    expect(focusable.map((el) => el.getAttribute('name') ?? el.textContent?.trim())).toEqual([
      'recovery_code', 'Continue', 'Use the authenticator instead', 'Start over',
    ]);
  });
});
