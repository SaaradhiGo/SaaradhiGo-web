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

export type PublicRole = 'rider' | 'driver';

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

export function writeRiderTokens(access: string, refresh?: string) {
  try {
    window.localStorage.setItem(RIDER_TOKEN_KEY, access);
    if (refresh) window.localStorage.setItem(RIDER_REFRESH_KEY, refresh);
  } catch {
    /* private mode: the session simply does not persist */
  }
}

export function clearRiderTokens() {
  try {
    window.localStorage.removeItem(RIDER_TOKEN_KEY);
    window.localStorage.removeItem(RIDER_REFRESH_KEY);
  } catch {
    /* nothing to clear */
  }
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
  return api.post<{ message?: string }>('/auth/email/register/', {
    full_name: input.fullName.trim(),
    phone_number: normalisePhone(input.phone),
    email: input.email.trim(),
    password: input.password,
    confirm_password: input.confirmPassword,
    role: input.role,
  });
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

type LoginResp = { token?: string; refresh_token?: string; user?: unknown };

/** The envelope really is `token` / `refresh_token`, not `access` / `refresh`. */
function storeSession(data: LoginResp) {
  if (!data?.token) {
    throw new ApiError(
      200,
      'AUTH_NO_TOKEN',
      'Signed in, but the server returned no token. Please try again.',
    );
  }
  writeRiderTokens(data.token, data.refresh_token);
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
  const actual = (data?.user as { role?: string } | undefined)?.role;
  if (actual && actual !== expected) {
    clearRiderTokens();
    const other = actual === 'driver' ? 'driver' : actual === 'admin' ? 'staff' : 'rider';
    throw new ApiError(
      403,
      'AUTH_WRONG_ROLE',
      expected === 'driver'
        ? `That is a ${other} account. Use the rider sign-in instead.`
        : `That is a ${other} account. Use the driver sign-in instead.`,
    );
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
  if (err instanceof ApiError && err.message) return err.message;
  return fallback;
}

/** The address exists but has not been confirmed yet. */
export function isUnverified(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'AUTH_EMAIL_UNVERIFIED';
}
