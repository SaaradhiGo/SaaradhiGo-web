// Rider and driver authentication for the public site.
//
// WHAT THE BACKEND ACTUALLY OFFERS, which is what these functions mirror:
//
//   POST /auth/email/register/        create a rider or driver account
//   POST /auth/email/login/           email + password -> tokens
//   POST /auth/password/forgot/       request a reset link
//   POST /auth/password/reset/        uid + token + new password
//   POST /auth/email/verify/confirm/  uid + token -> address verified
//   POST /auth/otp/ + /auth/login/    the phone route, unchanged
//
// TWO THINGS THAT SHAPE THE UI
//
// 1. An account cannot sign in with a password until its address is
//    verified. The server answers AUTH_EMAIL_UNVERIFIED, and the sign-in
//    page turns that into a specific instruction rather than "login failed".
//
// 2. Registration answers the same way whether the account was created or
//    the address was already taken. That is deliberate on the server side --
//    it stops the form being used to discover who holds an account -- so the
//    UI must not claim "account created!" either. It says to check the inbox.
//
// SEPARATE TOKENS FROM THE OPS CONSOLE
// A rider's session is stored under its own keys, never the console's
// `saaradhi_admin_*`, so a rider session can never be read as an operator's.

import { ApiError, api } from './api';

export const RIDER_TOKEN_KEY = 'saaradhi_rider_access_token';
export const RIDER_REFRESH_KEY = 'saaradhi_rider_refresh_token';
export const RIDER_USER_KEY = 'saaradhi_rider_user';

export type PublicRole = 'rider' | 'driver';

/**
 * WHO is signed in, not merely THAT someone is.
 *
 * The session used to be a token and nothing else. Every screen that asked
 * "are we signed in?" got a yes or a no and had no way to ask anything
 * further, so the site had exactly one signed-in appearance -- the rider's.
 * A driver who signed in correctly was shown "My trips" in the header and
 * the rider homepage underneath it, with no driver screen anywhere and no
 * name, number or role on display. The sign-in had worked; the product
 * simply never looked at its own answer.
 *
 * The login response already carries the account. It is kept here, beside
 * the token it came with, so the role is available the moment the page
 * renders rather than after a round trip -- and refreshed from
 * `/auth/profile/` so a stale copy cannot outlive a change.
 */
export type SessionUser = {
  id?: number | string;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  role?: string | null;
  avatar?: string | null;
  city?: string | null;
  created_at?: string | null;
};

export function readSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RIDER_USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeSessionUser(user: SessionUser | null) {
  try {
    if (user) window.localStorage.setItem(RIDER_USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(RIDER_USER_KEY);
  } catch {
    /* private mode: the session simply does not persist */
  }
}

/** The account as the server currently has it. Also refreshes the copy. */
export async function fetchProfile(): Promise<SessionUser | null> {
  const token = readRiderToken();
  if (!token) return null;
  const user = await api.get<SessionUser>('/auth/profile/', token);
  writeSessionUser(user);
  announceSession();
  return user;
}

/** Update the name or email on the signed-in account. */
export async function updateProfile(patch: {
  full_name?: string;
  email?: string;
}): Promise<SessionUser> {
  const token = readRiderToken();
  const user = await api.patch<SessionUser>('/auth/update/', patch, token);
  writeSessionUser(user);
  announceSession();
  return user;
}

export type RegisterInput = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: PublicRole;
};

/** Sending an SMS costs money and reaches a real handset, so it is opt-in. */
export function otpSendingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_OTP_SEND === 'true';
}

export function looksLikePhone(value: string): boolean {
  return /^\+\d{8,15}$/.test(value.replace(/[\s-]/g, ''));
}

export function normalisePhone(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function readRiderToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(RIDER_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Fired in THIS tab when the rider signs in or out.
 *
 * The browser's own `storage` event only reaches OTHER tabs, so a component
 * that renders the session -- the nav -- had no way to learn about a sign-in
 * that happened beside it. The result was a rider who had just signed in
 * still being offered "Log in" and "Sign up" in the header, on the very page
 * their sign-in had returned them to.
 */
export const SESSION_EVENT = 'saaradhi:session';

function announceSession() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function writeRiderTokens(
  access: string,
  refresh?: string,
  user?: SessionUser | null,
) {
  try {
    window.localStorage.setItem(RIDER_TOKEN_KEY, access);
    if (refresh) window.localStorage.setItem(RIDER_REFRESH_KEY, refresh);
  } catch {
    /* private mode: the session simply does not persist */
  }
  if (user !== undefined) writeSessionUser(user);
  announceSession();
}

export function clearRiderTokens() {
  try {
    window.localStorage.removeItem(RIDER_TOKEN_KEY);
    window.localStorage.removeItem(RIDER_REFRESH_KEY);
    window.localStorage.removeItem(RIDER_USER_KEY);
  } catch {
    /* nothing to clear */
  }
  announceSession();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Create an account. Resolves with the server's message on success.
 *
 * The caller must NOT say "account created": see the note at the top.
 */
export async function registerAccount(input: RegisterInput) {
  // `verification_required` is a property of the DEPLOYMENT, not of this
  // address -- it is the same for every caller, so it reveals nothing about
  // whether a particular address was already registered. It is false where
  // the server cannot send mail, in which case the account is ready to use
  // and telling someone to check an inbox would be a lie.
  return api.post<{ message?: string; verification_required?: boolean }>(
    '/auth/email/register/', {
    full_name: input.fullName.trim(),
    phone_number: normalisePhone(input.phone),
    email: input.email.trim(),
    password: input.password,
    confirm_password: input.confirmPassword,
    role: input.role,
    },
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

type LoginResp = { token?: string; refresh_token?: string; user?: SessionUser };

/** The envelope really is `token` / `refresh_token`, not `access` / `refresh`. */
function storeSession(data: LoginResp) {
  if (!data?.token) {
    throw new ApiError(
      200,
      'AUTH_NO_TOKEN',
      'Signed in, but the server returned no token. Please try again.',
    );
  }
  // The account travels WITH the token. Every signed-in screen then knows
  // whose session this is without a second request -- which is what lets the
  // header greet a driver as a driver instead of showing them a rider's nav.
  writeRiderTokens(data.token, data.refresh_token, data.user ?? null);
  return data;
}

/**
 * Refuse a session whose role is not the one this entrance is for.
 *
 * A driver signing in through the rider entrance used to be accepted and
 * landed on the rider home, where every driver action is missing; a rider
 * through the driver entrance got an empty driver app. The server is still
 * the authority -- it refuses the actions either way -- but letting the
 * wrong role in and then showing them a broken screen is not an answer.
 *
 * The session is cleared before throwing, so a refused sign-in leaves no
 * token behind.
 */
function requireRole(data: LoginResp, expected: PublicRole) {
  const actual = data?.user?.role;
  if (actual && actual !== expected) {
    clearRiderTokens();
    // Name the door they should have used, rather than the role they are.
    // "That is a staff account" told an operator what they already knew and
    // nothing about where to go.
    const elsewhere =
      actual === 'driver'
        ? 'This is a driver account — use the driver sign-in.'
        : actual === 'rider'
          ? 'This is a rider account — use the rider sign-in.'
          : 'This is an operator account — sign in to the operations console.';
    throw new ApiError(403, 'AUTH_WRONG_ROLE', elsewhere, true);
  }
  return data;
}

export async function signInWithEmail(
  email: string,
  password: string,
  expectedRole?: PublicRole,
) {
  const data = await api.post<LoginResp>('/auth/email/login/', {
    email: email.trim(),
    password,
  });
  const session = storeSession(data);
  return expectedRole ? requireRole(session, expectedRole) : session;
}

/**
 * Numbers for which the mobile route works on an environment that does not
 * send SMS to the public.
 *
 * These are the SAME numbers the server already carries in
 * `TEST_PHONE_NUMBERS`, which it answers without ever calling SNS. Listing
 * them here does not create a bypass and does not weaken anything: it only
 * stops the UI from offering a journey that would fail, and lets the mobile
 * route be exercised in QA without sending a message to a real handset.
 */
export function qaTestPhones(): string[] {
  return (process.env.NEXT_PUBLIC_QA_TEST_PHONES || '')
    .split(',')
    .map((v) => normalisePhone(v))
    .filter(Boolean);
}

export function phoneAllowedForOtp(phone: string): boolean {
  if (otpSendingEnabled()) return true;
  return qaTestPhones().includes(normalisePhone(phone));
}

export async function sendPublicOtp(phone: string, role: PublicRole) {
  if (!phoneAllowedForOtp(phone)) {
    throw new ApiError(
      0,
      'OTP_SENDING_DISABLED',
      'This environment does not send text messages to the public. Sign in '
        + 'with your email and password, or use an approved QA test number.',
    );
  }
  return api.post<{ message?: string }>('/auth/otp/', {
    phone_number: normalisePhone(phone),
    role,
  });
}

export async function verifyPublicOtp(
  phone: string,
  otp: string,
  expectedRole?: PublicRole,
) {
  const data = await api.post<LoginResp>('/auth/login/', {
    phone_number: normalisePhone(phone),
    otp: otp.trim(),
  });
  const session = storeSession(data);
  return expectedRole ? requireRole(session, expectedRole) : session;
}

// ---------------------------------------------------------------------------
// Password reset and email verification
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email: string) {
  return api.post<{ message?: string }>('/auth/password/forgot/', {
    email: email.trim(),
  });
}

export async function resetPassword(
  uid: string,
  token: string,
  newPassword: string,
) {
  return api.post<{ message?: string }>('/auth/password/reset/', {
    uid,
    token,
    new_password: newPassword,
  });
}

export async function confirmEmailVerification(uid: string, token: string) {
  return api.post<{ message?: string }>('/auth/email/verify/confirm/', {
    uid,
    token,
  });
}

/** Turn a server error into something the person can act on. */
export function messageFor(err: unknown, fallback: string): string {
  // Only text the SERVER wrote for a person reaches a screen. Anything this
  // client synthesised from a status code -- "HTTP 502" -- is for the log,
  // and the caller's fallback is what the rider reads instead.
  if (err instanceof ApiError && err.fromServer && err.message) return err.message;
  return fallback;
}

/** The address exists but has not been confirmed yet. */
export function isUnverified(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'AUTH_EMAIL_UNVERIFIED';
}
