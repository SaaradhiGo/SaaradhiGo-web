// Thin REST client for the backend API.
//
// Token persistence lives in localStorage (NOT cookies) so we can run
// the console as a static SPA bundled by Next.js. If we later need
// CSRF-protected mutations from a server component, we'll migrate to
// httpOnly cookies + a /api/auth proxy on the Next side.

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export const TOKEN_KEY = 'saaradhi_admin_access_token';
export const REFRESH_KEY = 'saaradhi_admin_refresh_token';

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function writeTokens({ access, refresh }: { access: string; refresh?: string }) {
  window.localStorage.setItem(TOKEN_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  // The operator's own record goes with the session it belonged to. Leaving
  // it behind would have the console greeting the previous operator by name
  // on the sign-in screen.
  window.localStorage.removeItem('saaradhi_admin_user');
}

export class ApiError extends Error {
  /**
   * Whether `message` was written by the server FOR A PERSON.
   *
   * It matters because `messageFor` decides from it whether the text may be
   * shown to a rider. A 502 from a gateway has no error body, so the message
   * became "HTTP 502" -- which is true, useless to a passenger, and was
   * appearing on the booking panel. The status is still on the error for the
   * log; it is simply no longer mistaken for copy.
   */
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fromServer: boolean = false,
    /**
     * Which input the server blamed, when it named one.
     *
     * Without this a field error could only be shown as a banner at the top
     * of the form. "Enter a valid email address." then appeared on whatever
     * step the person happened to be on -- on the driver sign-up it landed
     * on the contact-number step, pointing at a field that was fine, while
     * the email box it was about was on a screen they had already left.
     */
    public field: string | null = null,
  ) {
    super(message);
  }
}

/**
 * `authToken` exists because this client serves TWO principals.
 *
 * The ops console stores its session under `saaradhi_admin_access_token`;
 * a rider on the public site stores one under `saaradhi_rider_access_token`.
 * `readToken()` only ever knew about the first, so every authenticated call
 * the public site made went out with NO Authorization header and came back
 * 401 -- which looked like a broken endpoint rather than a missing token.
 *
 * Callers on the public side pass their own token explicitly. Nothing here
 * guesses which principal is active, because guessing is how a rider session
 * would end up being sent to an operator endpoint.
 */
async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  authToken?: string | null,
): Promise<T> {
  const token = authToken !== undefined ? authToken : readToken();
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* empty response is fine */
  }
  if (!resp.ok) {
    const err = json?.error ?? {};
    const authored = typeof err.message === 'string' && err.message.trim() !== '';
    throw new ApiError(
      resp.status,
      err.code ?? 'UNKNOWN_ERROR',
      authored ? err.message : `HTTP ${resp.status}`,
      authored,
      typeof err.field === 'string' && err.field !== 'general' ? err.field : null,
    );
  }
  // Standard backend envelope: {status, data} for success
  // or DRF pagination response (results / next / previous).
  return (json?.data ?? json) as T;
}

/**
 * Send a file (and fields) as multipart, through OUR API.
 *
 * WHY NOT THE PRESIGNED DIRECT-TO-S3 PUT, which exists and is the better
 * shape on paper: a browser will not make that PUT unless the BUCKET
 * publishes a CORS rule allowing the origin, and the Railway-managed bucket
 * does not. Its storage API also refuses `PutBucketCORS` with the
 * credentials the deployment holds, so the rule cannot be added from the
 * application side at all. Measured, not assumed: the PUT fails in the
 * browser with `net::ERR_FAILED` before it leaves.
 *
 * The Android apps never hit this because a native HTTP client does not
 * enforce CORS, which is why the presign path has always looked fine.
 *
 * So the web sends the bytes to Django, which writes them to S3 with server
 * credentials. That costs a worker for the length of the upload, which for
 * a driver's documents -- a few megabytes, a handful of times, once -- is a
 * trade worth making to remove a dependency on a bucket setting nobody can
 * verify. It is also STRICTER: the server validates the real bytes with
 * `validate_document_file` instead of validating a key and trusting what is
 * behind it.
 *
 * `Content-Type` is deliberately NOT set. The browser must write it itself
 * so the multipart boundary matches the body; setting it by hand is the
 * classic way to produce a request Django cannot parse.
 */
async function callForm<T>(
  method: string,
  path: string,
  form: FormData,
  authToken?: string | null,
): Promise<T> {
  const token = authToken !== undefined ? authToken : readToken();
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    /* empty response is fine */
  }
  if (!resp.ok) {
    const err = json?.error ?? {};
    const authored = typeof err.message === 'string' && err.message.trim() !== '';
    throw new ApiError(
      resp.status,
      err.code ?? 'UNKNOWN_ERROR',
      authored ? err.message : `HTTP ${resp.status}`,
      authored,
      typeof err.field === 'string' && err.field !== 'general' ? err.field : null,
    );
  }
  return (json?.data ?? json) as T;
}

export const api = {
  get: <T,>(path: string, authToken?: string | null) =>
    call<T>('GET', path, undefined, authToken),
  post: <T,>(path: string, body?: unknown, authToken?: string | null) =>
    call<T>('POST', path, body, authToken),
  patch: <T,>(path: string, body?: unknown, authToken?: string | null) =>
    call<T>('PATCH', path, body, authToken),
  delete: <T,>(path: string, authToken?: string | null) =>
    call<T>('DELETE', path, undefined, authToken),
  patchForm: <T,>(path: string, form: FormData, authToken?: string | null) =>
    callForm<T>('PATCH', path, form, authToken),
  postForm: <T,>(path: string, form: FormData, authToken?: string | null) =>
    callForm<T>('POST', path, form, authToken),
};

// ---- Auth helpers ----

// The console does NOT declare a role. It used to send `role: 'admin'`, and the
// backend used to honour that -- which is the client half of the privilege
// escalation closed in the backend this week: a self-declared role was enough to
// be created as an operator. `POST /auth/otp/` now rejects any privileged role
// with HTTP 400, so sending it would simply break sign-in.
//
// Authority comes from the stored account (role admin AND is_staff, set only by
// `bootstrap_qa_operator` or the Django admin), never from what the client asks
// for. An operator signing in here is recognised because of what their account
// already is.
export async function requestOtp(phone: string) {
  return api.post<{ message?: string }>('/auth/otp/', { phone_number: phone });
}

export async function loginWithOtp(phone: string, otp: string) {
  // Field names are `token` / `refresh_token`, which is what the backend's
  // success envelope actually contains. This read `access` / `refresh`, so
  // `writeTokens` never fired: the login appeared to succeed, stored nothing, and
  // the console layout bounced straight back to /login. A silent sign-in loop,
  // and the reason nobody could get into this console.
  type LoginResp = { token?: string; refresh_token?: string; user?: unknown };
  const data = await api.post<LoginResp>('/auth/login/', {
    phone_number: phone,
    otp,
  });
  if (data?.token) {
    writeTokens({ access: data.token, refresh: data.refresh_token });
  } else {
    throw new ApiError(
      200,
      'AUTH_NO_TOKEN',
      'Signed in but the server returned no token.',
    );
  }
  return data;
}

export const ADMIN_USER_KEY = 'saaradhi_admin_user';

export type OperatorUser = {
  id?: number | string;
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  role?: string | null;
};

export function readOperator(): OperatorUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_USER_KEY);
    return raw ? (JSON.parse(raw) as OperatorUser) : null;
  } catch {
    return null;
  }
}

/**
 * Sign an operator in with an email address (or phone) and a password.
 *
 * THE CONSOLE HAD NO PASSWORD DOOR. Its only sign-in was phone + one-time
 * code, the same OTP route the rider apps use. An operator account created
 * with an email address and a password -- which is how `admin@saaradhigo.com`
 * exists -- had nothing it could sign in to: the code route is keyed on a
 * phone number, and `/auth/admin/login/` only accepted a phone number too.
 *
 * `/auth/admin/login/` now takes either identifier. It is the right endpoint
 * rather than `/auth/email/login/` because it is the one that enforces
 * `is_operator` BEFORE minting a token, so a token from it always represents
 * an account allowed to operate the platform.
 */
export async function adminLoginWithPassword(
  identifier: string,
  password: string,
  mfaCode?: string,
) {
  const looksLikeEmail = identifier.includes('@');
  type LoginResp = {
    token?: string;
    refresh_token?: string;
    user?: OperatorUser;
  };
  const data = await api.post<LoginResp>(
    '/auth/admin/login/',
    {
      ...(looksLikeEmail
        ? { email: identifier.trim() }
        : { phone_number: identifier.trim() }),
      password,
      ...(mfaCode ? { mfa_code: mfaCode } : {}),
    },
    // Explicitly no token: a stale, expired console session in localStorage
    // would otherwise be sent on the request that is meant to replace it.
    null,
  );
  if (!data?.token) {
    throw new ApiError(
      200,
      'AUTH_NO_TOKEN',
      'Signed in but the server returned no token.',
    );
  }
  writeTokens({ access: data.token, refresh: data.refresh_token });
  try {
    if (data.user) {
      window.localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user));
    }
  } catch {
    /* private mode: the console still works, it just cannot greet by name */
  }
  return data;
}
