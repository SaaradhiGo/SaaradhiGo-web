'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  adminLoginWithPassword,
  changePassword,
  readToken,
} from '@/lib/api';
import { LOGIN_LOCK_AFTER, LOGIN_LOCK_MINUTES } from '@/lib/consoleEnv';
import { useTheme } from '@/lib/consolePrefs';
import { Logo } from '@/components/sg/Logo';
import { EnvBadge } from '@/components/console/EnvBadge';
import {
  Alert, ArrowRight, Check, Clock, KeyRound, Lock, Moon, Sun,
} from '@/components/console/icons';
import '@/styles/console.css';

/**
 * Staff sign-in.
 *
 * EMAIL AND PASSWORD, THEN A CODE. The phone-and-text route is gone from
 * this screen on purpose: a staff account can approve payouts and read
 * personal data, and a session that can be opened with a SIM swap is the
 * weakest door on the platform. Operators who were onboarded by phone sign
 * in here with their email once they have one; until then they do not sign
 * in here. That is the decision, recorded.
 *
 * It goes to `/auth/admin/login/`, which enforces `is_operator` BEFORE it
 * mints a token, demands the second factor where the environment requires
 * one (`AUTH_MFA_REQUIRED`), and asks the emergency account for a reason
 * (`AUTH_BREAK_GLASS_REASON_REQUIRED`). Each of those is a step here, not an
 * error.
 *
 * THE FORM NEVER SAYS WHICH PART WAS WRONG. Wrong email, wrong password,
 * right password on a rider's account and a locked account all come back
 * as one refusal from the server, and they are shown as one sentence here.
 * Anything that distinguishes them turns this form into an oracle.
 *
 * THE LOCKED STATE IS THIS BROWSER'S COUNT. The server locks an account
 * after repeated failures and -- deliberately -- answers the lock with the
 * same refusal as a wrong password. So the console keeps its own count
 * and, after `LOGIN_LOCK_AFTER` consecutive failures, stops offering the
 * form and says the account is paused for the server's window. It cannot
 * know the server's count; it can stop a person hammering a form that will
 * refuse them anyway.
 */
type Step =
  | 'credentials'  // email + password
  | 'totp'         // the six digits
  | 'recovery'     // a recovery code instead of the six digits
  | 'reason'       // break-glass: why
  | 'password'     // forced password change
  | 'locked';      // too many attempts, from this browser

const PREVIEWABLE: Step[] = ['totp', 'recovery', 'reason', 'password', 'locked'];
const LOCK_KEY = 'saaradhi_login_lock_until';

/**
 * The review strip that reaches every state above, and the `?preview=`
 * handling that drives it, exist ONLY in builds made with
 * `NEXT_PUBLIC_CONSOLE_PREVIEW=true` (QA, local). The constant is inlined
 * at build time, so in any other build this branch is dead, the dynamic
 * import is never emitted, and no preview code path is in the bundle --
 * which `scripts/check-no-preview.mjs` verifies against the output. A
 * runtime flag would only have hidden it.
 */
const PREVIEW_BUILT_IN = process.env.NEXT_PUBLIC_CONSOLE_PREVIEW === 'true';
const LoginPreview = PREVIEW_BUILT_IN
  ? dynamic(() => import('./LoginPreview').then((m) => m.LoginPreview), { ssr: false })
  : null;

function readLockUntil(): number | null {
  try {
    const raw = window.sessionStorage.getItem(LOCK_KEY);
    const until = raw ? Number(raw) : 0;
    return until > Date.now() ? until : null;
  } catch {
    return null;
  }
}

function writeLockUntil(until: number | null) {
  try {
    if (until) window.sessionStorage.setItem(LOCK_KEY, String(until));
    else window.sessionStorage.removeItem(LOCK_KEY);
  } catch {
    /* no storage: the lock lasts for this page only */
  }
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [theme, setTheme] = useTheme();

  const next = search.get('next') || '/dashboard';
  const expired = search.get('reason') === 'expired';
  const previewParam = PREVIEW_BUILT_IN ? search.get('preview') : null;
  const preview = previewParam as Step | null;
  const previewExpired = previewParam === 'expired';

  const [step, setStep] = useState<Step>(
    preview && PREVIEWABLE.includes(preview) ? preview : 'credentials',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  // An already-signed-in operator who lands here goes straight in. A
  // session that just ended has had its token cleared, so `expired` and a
  // token never coexist.
  useEffect(() => {
    if (readToken()) router.replace(next);
  }, [router, next]);

  // The console's theme follows the operator into the sign-in page; the
  // <html> attribute has to match so the scrollbar and native controls do.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const until = readLockUntil();
    if (until) {
      setLockUntil(until);
      setStep('locked');
    }
  }, []);

  // Focus follows the step. autoFocus only fires on mount, and these
  // inputs mount one at a time.
  useEffect(() => {
    const el = step === 'credentials' ? emailRef.current
      : step === 'totp' || step === 'recovery' ? codeRef.current
        : step === 'reason' ? reasonRef.current
          : step === 'password' ? pwRef.current : null;
    el?.focus();
  }, [step]);

  // Released on the minute it expires, without a reload.
  useEffect(() => {
    if (!lockUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= lockUntil) {
        writeLockUntil(null);
        setLockUntil(null);
        setFailures(0);
        setStep('credentials');
        setError(null);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lockUntil]);

  const lock = useCallback(() => {
    const until = Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000;
    writeLockUntil(until);
    setLockUntil(until);
    setStep('locked');
    setError(null);
  }, []);

  function refused(message: string) {
    const n = failures + 1;
    setFailures(n);
    if (n >= LOGIN_LOCK_AFTER) {
      lock();
      return;
    }
    setError(message);
  }

  function serverText(err: unknown): string | null {
    // Only text the server wrote for a person. "HTTP 502" is for the log.
    return err instanceof ApiError && err.fromServer && err.message ? err.message : null;
  }

  async function attempt(extra: { mfaCode?: string; reason?: string } = {}) {
    setBusy(true);
    setError(null);
    try {
      await adminLoginWithPassword(email, password, extra.mfaCode, extra.reason);
      writeLockUntil(null);
      router.replace(next);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'AUTH_MFA_REQUIRED') {
        // Not a failure: the first factor was accepted and the second is
        // now being asked for.
        setStep('totp');
        setCode('');
      } else if (code === 'AUTH_BREAK_GLASS_REASON_REQUIRED') {
        setStep('reason');
      } else if (code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
        // Not emitted by the server yet; the screen exists for when it is.
        setStep('password');
      } else if (code === 'AUTH_INVALID_CREDENTIALS' || (err instanceof ApiError && err.status === 401)) {
        refused(step === 'totp' || step === 'recovery'
          ? 'That code did not work. Codes change every 30 seconds — enter the current one.'
          : 'That email and password did not match. Check both and try again.');
        setCode('');
      } else {
        setError(serverText(err) ?? 'We could not sign you in. Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  }

  // THE BUTTON IS NEVER DISABLED FOR AN EMPTY FIELD. A disabled gold button
  // renders as olive and reads as a rendering fault, and the first thing a
  // person saw on this screen was a broken-looking button. Pressing it with
  // a field empty says which field, which is more useful anyway.
  function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(!email.trim() ? 'Enter your email address.' : 'Enter your password.');
      return;
    }
    void attempt();
  }

  function onCode(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (step === 'totp' ? value.length !== 6 : value.length < 4) {
      setError(step === 'totp' ? 'Enter all six digits.' : 'Enter the whole recovery code.');
      return;
    }
    void attempt({ mfaCode: value, ...(reason ? { reason } : {}) });
  }

  function onReason(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 12) {
      setError('Say a little more: at least 12 characters, and specific.');
      return;
    }
    void attempt({ reason: reason.trim(), ...(code ? { mfaCode: code } : {}) });
  }

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw || newPw.length < 12) {
      setError(!currentPw ? 'Enter your current password.' : 'The new password needs at least 12 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(currentPw, newPw);
      setNotice('Password changed. Sign in with the new one.');
      setPassword('');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setStep('credentials');
    } catch (err) {
      setError(serverText(err) ?? 'The password could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  // Six digits typed or pasted: go, without a second gesture.
  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) {
      void attempt({ mfaCode: digits, ...(reason ? { reason } : {}) });
    }
  }

  const lockClock = lockUntil
    ? new Date(lockUntil).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '';

  const heading = {
    credentials: 'Sign in',
    totp: 'Enter your code',
    recovery: 'Use a recovery code',
    reason: 'Say why',
    password: 'Choose a new password',
    locked: 'Paused',
  }[step];

  const sub = {
    credentials: 'Staff accounts only. Riders and drivers use the SaaradhiGo app.',
    totp: `Open your authenticator app and enter the six-digit code for ${email || 'this account'}.`,
    recovery: 'One of the codes you saved when you set up your authenticator. Each works once.',
    reason: 'This is the emergency account. A reason is required and every Super Admin is told.',
    password: 'Your password must be replaced before you can continue.',
    locked: 'Too many attempts in a row.',
  }[step];

  return (
    <div className="login" data-theme={theme}>
      <aside className="login__brand sg-on-noir">
        <Link href="/" className="login__lockup" aria-label="Saaradhi Go, public site">
          <Logo variant="emblem" />
          <span>Saaradhi Go</span>
        </Link>

        <div className="login__hero">
          <h1>SaaradhiGo <em>Admin</em></h1>
          <p>Staff access for operations: approve driver documents, follow
            live rides, resolve disputes, review payments and respond to SOS
            alerts.</p>
        </div>

        <ul className="login__caps" aria-label="What the console is for">
          <li>Driver onboarding</li>
          <li>Live rides</li>
          <li>Payments</li>
          <li>Safety</li>
        </ul>
      </aside>

      <main className="login__panel">
        <div className="login__card">
          <div className="login__head">
            <div className="login__head-row">
              <h2>{heading}</h2>
              <EnvBadge />
            </div>
            <p>{sub}</p>
          </div>

          {(expired || previewExpired) && step === 'credentials' && (
            <div className="login__notice" role="status">
              <Clock />
              <span><b>Your session ended.</b> Sign in again to pick up where you were.</span>
            </div>
          )}
          {notice && (
            <div className="login__notice" role="status">
              <Check />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="login__alert" role="alert">
              <Alert />
              <span>{error}</span>
            </div>
          )}

          {step === 'credentials' && (
            <form className="login__form" onSubmit={onCredentials} noValidate>
              <div className="login__field">
                <label htmlFor="login-email">Email address</label>
                <input
                  ref={emailRef}
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="you@saaradhigo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  required
                />
              </div>
              <div className="login__field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  required
                />
              </div>
              <button
                type="submit"
                className="sg-btn sg-btn--primary login__submit"
                disabled={busy}
              >
                {busy ? 'Signing you in…' : 'Sign in'}
                {!busy && <ArrowRight />}
              </button>
              <div className="login__links">
                <Link href="/login/help" className="login__link login__link--quiet">
                  Get help signing in
                </Link>
              </div>
            </form>
          )}

          {(step === 'totp' || step === 'recovery') && (
            <form className="login__form" onSubmit={onCode} noValidate>
              <div className="login__field">
                <label htmlFor="login-code">
                  {step === 'totp' ? 'Authenticator code' : 'Recovery code'}
                </label>
                {step === 'totp' ? (
                  <input
                    ref={codeRef}
                    id="login-code"
                    name="mfa_code"
                    className="login__code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => onCodeChange(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby="login-code-hint"
                    required
                  />
                ) : (
                  <input
                    ref={codeRef}
                    id="login-code"
                    name="recovery_code"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="xxxx-xxxx-xxxx"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    required
                  />
                )}
                <p className="login__hint" id="login-code-hint">
                  {step === 'totp'
                    ? 'Paste works. The code is checked as soon as six digits are in.'
                    : 'A used recovery code stops working; set up a fresh authenticator afterwards.'}
                </p>
              </div>
              <button
                type="submit"
                className="sg-btn sg-btn--primary login__submit"
                disabled={busy}
              >
                {busy ? 'Checking…' : 'Continue'}
                {!busy && <ArrowRight />}
              </button>
              <div className="login__links">
                {step === 'totp' ? (
                  <button type="button" className="login__link" onClick={() => { setStep('recovery'); setCode(''); setError(null); }}>
                    Use a recovery code
                  </button>
                ) : (
                  <button type="button" className="login__link" onClick={() => { setStep('totp'); setCode(''); setError(null); }}>
                    Use the authenticator instead
                  </button>
                )}
                <button type="button" className="login__link login__link--quiet" onClick={() => { setStep('credentials'); setCode(''); setError(null); }}>
                  Start over
                </button>
              </div>
            </form>
          )}

          {step === 'reason' && (
            <form className="login__form" onSubmit={onReason} noValidate>
              <div className="login__state">
                <span className="login__state-icon"><KeyRound /></span>
                <h3>Emergency account</h3>
                <p>Every action in this session is recorded against the reason
                  you give, and the named Super Admins are notified now.</p>
              </div>
              <div className="login__field">
                <label htmlFor="login-reason">Reason for using it</label>
                <textarea
                  ref={reasonRef}
                  id="login-reason"
                  name="reason"
                  placeholder="What is broken, and why the usual accounts cannot fix it."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  aria-describedby="login-reason-hint"
                  required
                  minLength={12}
                />
                <p className="login__hint" id="login-reason-hint">At least 12 characters. Be specific; this is read by people.</p>
              </div>
              <button
                type="submit"
                className="sg-btn sg-btn--primary login__submit"
                disabled={busy}
              >
                {busy ? 'Signing you in…' : 'Continue with this reason'}
                {!busy && <ArrowRight />}
              </button>
              <div className="login__links">
                <button type="button" className="login__link login__link--quiet" onClick={() => { setStep('credentials'); setReason(''); setError(null); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {step === 'password' && (
            <form className="login__form" onSubmit={onPassword} noValidate>
              <div className="login__field">
                <label htmlFor="login-current">Current password</label>
                <input
                  ref={pwRef}
                  id="login-current"
                  name="current_password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                />
              </div>
              <div className="login__field">
                <label htmlFor="login-new">New password</label>
                <input
                  id="login-new"
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  aria-describedby="login-new-hint"
                  required
                  minLength={12}
                />
                <p className="login__hint" id="login-new-hint">At least 12 characters, and not one you have used before.</p>
              </div>
              <div className="login__field">
                <label htmlFor="login-confirm">New password again</label>
                <input
                  id="login-confirm"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  aria-invalid={confirmPw && confirmPw !== newPw ? true : undefined}
                  required
                />
              </div>
              <button
                type="submit"
                className="sg-btn sg-btn--primary login__submit"
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Change password and continue'}
                {!busy && <ArrowRight />}
              </button>
            </form>
          )}

          {step === 'locked' && (
            <div className="login__form">
              <div className="login__state login__state--locked" role="status">
                <span className="login__state-icon"><Lock /></span>
                <h3>Sign-in is paused for this account</h3>
                <p>
                  Too many attempts in a row. It opens again
                  {lockClock ? ` at ${lockClock}` : ` in ${LOGIN_LOCK_MINUTES} minutes`}.
                  If you did not make these attempts, tell your administrator now.
                </p>
              </div>
              <button type="button" className="sg-btn sg-btn--primary login__submit" disabled>
                <Lock /> Paused
              </button>
              <div className="login__links">
                <Link href="/login/help" className="login__link">Get help signing in</Link>
              </div>
            </div>
          )}
        </div>

        <footer className="login__footer">
          <span>© {new Date().getFullYear()} SaaradhiGo · Staff access only</span>
          <button
            type="button"
            className="login__link login__link--quiet"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
        </footer>
      </main>

      {LoginPreview ? <LoginPreview current={previewExpired ? 'expired' : step} /> : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
