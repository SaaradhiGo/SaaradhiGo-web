// Rider and driver authentication for the PUBLIC site.
//
// WHY THIS IS SEPARATE FROM lib/api's auth helpers
// ------------------------------------------------
// Those exist for the ops console, which signs in operators and stores the
// token under `saaradhi_admin_*`. A rider signing in on the marketing site is
// a different principal with a different token and a different landing page,
// and sharing one key would mean a rider's session could be mistaken for an
// operator's by anything reading localStorage.
//
// THE SMS GATE, WHICH IS THE IMPORTANT PART
// -----------------------------------------
// `POST /auth/otp/` sends a real SMS through AWS SNS to whatever number it is
// given. On a public page that is a form anyone on the internet can use to
// spend the project's money, one message at a time, and the pilot's standing
// rule is that no unauthorised SMS goes out.
//
// So sending is OFF unless `NEXT_PUBLIC_ALLOW_OTP_SEND` is explicitly "true".
// That mirrors the two gates this project already uses -- the mobile apps'
// `ALLOW_NON_PRODUCTION_HOST` and the backend's `AUTH_EMAIL_ALLOWLIST`, both
// of which default to the safe answer and require a deliberate opt-in.
//
// With the gate closed the forms still render, still validate, and tell the
// visitor what to do instead. They do not silently pretend to have sent
// anything.

import { ApiError, api } from './api';

export const RIDER_TOKEN_KEY = 'saaradhi_rider_access_token';
export const RIDER_REFRESH_KEY = 'saaradhi_rider_refresh_token';

export type PublicRole = 'rider' | 'driver';

/** Is this deployment allowed to make the backend send an SMS? */
export function otpSendingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ALLOW_OTP_SEND === 'true';
}

/** Shown wherever the gate is closed, so the reason is never a mystery. */
export const OTP_DISABLED_MESSAGE =
  'Phone sign-in is not enabled on this environment, because sending an SMS ' +
  'costs money and this build is not the production site. Install the Android ' +
  'app to sign in, or contact us and we will help.';

/** E.164-ish check. The backend normalises properly; this is to catch typos. */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.replace(/[\s-]/g, '');
  return /^\+\d{8,15}$/.test(trimmed);
}

export function normalisePhone(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function readRiderToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(RIDER_TOKEN_KEY);
}

export function writeRiderTokens(access: string, refresh?: string) {
  window.localStorage.setItem(RIDER_TOKEN_KEY, access);
  if (refresh) window.localStorage.setItem(RIDER_REFRESH_KEY, refresh);
}

export function clearRiderTokens() {
  window.localStorage.removeItem(RIDER_TOKEN_KEY);
  window.localStorage.removeItem(RIDER_REFRESH_KEY);
}

/**
 * Ask the backend to send a sign-in code.
 *
 * `role` is sent because `/auth/otp/` binds the code to a role, and the
 * backend refuses any privileged value -- a self-declared `admin` is an
 * HTTP 400, which is the server half of a privilege-escalation fix. Only
 * `rider` and `driver` are self-service, and those are the only two values
 * this module can produce.
 */
export async function sendPublicOtp(phone: string, role: PublicRole) {
  if (!otpSendingEnabled()) {
    throw new ApiError(0, 'OTP_SENDING_DISABLED', OTP_DISABLED_MESSAGE);
  }
  return api.post<{ message?: string }>('/auth/otp/', {
    phone_number: normalisePhone(phone),
    role,
  });
}

/**
 * Exchange the code for a session.
 *
 * The envelope really is `token` / `refresh_token`. Reading `access` /
 * `refresh` is the mistake that once made the ops console appear to sign in
 * and store nothing, looping straight back to the login page; it is written
 * out here so the same bug is not reintroduced on the public side.
 */
export async function verifyPublicOtp(phone: string, otp: string) {
  type LoginResp = { token?: string; refresh_token?: string; user?: unknown };
  const data = await api.post<LoginResp>('/auth/login/', {
    phone_number: normalisePhone(phone),
    otp: otp.trim(),
  });
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
