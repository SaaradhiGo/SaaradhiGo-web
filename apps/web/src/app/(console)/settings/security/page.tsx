'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError, MfaStatus, fetchMfaStatus, regenerateRecoveryCodes, writeRecoveryLow,
} from '@/lib/api';
import {
  ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';
import { RecoveryCodesScreen } from '@/components/console/RecoveryCodes';
import { Alert, KeyRound } from '@/components/console/icons';

/**
 * The operator's own second factor.
 *
 * SELF-SERVICE, SO NOT GATED ON A PERMISSION. Every operator may see
 * whether their authenticator is enrolled and how many recovery codes
 * they have left, and may replace a lost set -- `/auth/admin/mfa/status/`
 * and `/auth/admin/mfa/recovery-codes/regenerate/` identify the operator
 * from the token and answer about nobody else. The rail shows this page
 * to everyone for the same reason.
 *
 * REGENERATING ASKS FOR THE AUTHENTICATOR, NOW. A bearer token is one
 * session; whoever held a stolen one could otherwise mint themselves a
 * permanent way back in. The server demands a live six-digit code and
 * refuses a recovery code for this, and it answers a wrong code with 403
 * rather than 401 so the console does not read it as the session ending.
 * The new set is shown once, on the same screen the first sign-in uses,
 * and the old set is dead the moment it appears.
 */
type Mode = 'status' | 'ask' | 'codes';

export default function SecurityPage() {
  const [status, setStatus] = useState<MfaStatus | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('status');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ codes: string[]; notice: string | null } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const regenRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await fetchMfaStatus());
    } catch (err) {
      setStatus(null);
      setLoadError(err instanceof ApiError && err.fromServer
        ? err.message
        : 'We could not load your sign-in settings.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Focus follows the step, as on the sign-in page.
  useEffect(() => {
    if (mode === 'ask') codeRef.current?.focus();
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (value.length !== 6) {
      setError('Enter all six digits from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await regenerateRecoveryCodes(value);
      setCode('');
      setIssued({ codes: data.recovery_codes, notice: data.recovery_codes_notice ?? null });
      // A fresh set is, by definition, not low.
      writeRecoveryLow(null);
      setMode('codes');
    } catch (err) {
      const serverText = err instanceof ApiError && err.fromServer ? err.message : null;
      if (err instanceof ApiError && err.code === 'AUTH_INVALID_CODE') {
        setCode('');
        setError('That code did not work. Codes change every 30 seconds — enter the current one.');
      } else {
        setError(serverText ?? 'We could not regenerate your codes. Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  }

  function done() {
    // The list leaves memory here; nothing else holds it.
    setIssued(null);
    setMode('status');
    void load();
    // Back where the operator started, not at the top of the page.
    setTimeout(() => regenRef.current?.focus(), 0);
  }

  function cancel() {
    setMode('status');
    setCode('');
    setError(null);
    setTimeout(() => regenRef.current?.focus(), 0);
  }

  const remaining = status?.recovery_codes_remaining ?? 0;
  const low = Boolean(status?.recovery_codes_low);

  return (
    <>
      <PageHeader
        title="Security"
        subtitle="Your authenticator and the recovery codes that stand in for it."
      />

      <div className="ops-stack">
        <Panel title="Two-step sign-in">
          {status === undefined ? (
            <Skeleton kind="text" />
          ) : status === null ? (
            <ErrorState title="Sign-in settings unavailable" detail={loadError ?? undefined} onRetry={() => void load()} />
          ) : !status.mfa_enabled ? (
            <>
            <dl className="ops-facts">
              <div className="ops-fact">
                <dt>Authenticator</dt>
                <dd><Pill tone="wait">Off in this environment</Pill></dd>
              </div>
            </dl>
            <p className="ops-fact__note">
              Two-step sign-in is switched off here, so recovery codes are
              not in use. Production always has it on.
            </p>
            </>
          ) : (
            <>
            <dl className="ops-facts">
              <div className="ops-fact">
                <dt>Authenticator</dt>
                <dd>
                  {status.enrolled ? <Pill tone="good">Enrolled</Pill>
                    : status.pending ? <Pill tone="wait">Set up, not yet confirmed</Pill>
                      : <Pill tone="bad">Not set up</Pill>}
                </dd>
              </div>
              <div className="ops-fact">
                <dt>Recovery codes left</dt>
                <dd>
                  <span className="ops-num ops-fact__num" data-testid="recovery-remaining">{remaining}</span>
                  {status.enrolled && low ? <Pill tone={remaining === 0 ? 'bad' : 'wait'}>Low</Pill> : null}
                </dd>
              </div>
            </dl>
            {status.pending && !status.enrolled ? (
              <p className="ops-fact__note">
                Your authenticator is confirmed by its first valid code at
                sign-in; your recovery codes are issued then and shown once.
              </p>
            ) : null}
            </>
          )}
        </Panel>

        {status && status.mfa_enabled && status.enrolled ? (
          <Panel title="Recovery codes">
            {mode === 'status' && (
              <div className="ops-stack ops-stack--tight">
                <p className="ops-prose">
                  Each code signs you in once if you lose your authenticator.
                  Regenerating replaces the whole set: every code you saved
                  before stops working.
                </p>
                <div>
                  <button
                    ref={regenRef}
                    type="button"
                    className="sg-btn sg-btn--secondary"
                    onClick={() => { setMode('ask'); setError(null); }}
                  >
                    <KeyRound /> Regenerate recovery codes
                  </button>
                </div>
              </div>
            )}

            {mode === 'ask' && (
              <form className="login__form rc-ask" onSubmit={submit} noValidate aria-labelledby="rc-ask-heading">
                <h3 id="rc-ask-heading" className="rc-ask__heading">Confirm it is you</h3>
                <p className="ops-prose">
                  Enter the current code from your authenticator app. A
                  recovery code is not accepted here.
                </p>
                {error && (
                  <div className="login__alert" role="alert">
                    <Alert />
                    <span>{error}</span>
                  </div>
                )}
                <div className="login__field">
                  <label htmlFor="rc-code">Authenticator code</label>
                  <input
                    ref={codeRef}
                    id="rc-code"
                    name="mfa_code"
                    className="login__code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    aria-invalid={error ? true : undefined}
                    aria-describedby="rc-code-hint"
                    required
                  />
                  <p className="login__hint" id="rc-code-hint">Six digits. Your current codes keep working until the new set is issued.</p>
                </div>
                <div className="ops-form__row">
                  <button type="submit" className="sg-btn sg-btn--primary" disabled={busy}>
                    {busy ? 'Checking…' : 'Issue new codes'}
                  </button>
                  <button type="button" className="sg-btn sg-btn--ghost" onClick={cancel}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {mode === 'codes' && issued && (
              <RecoveryCodesScreen
                codes={issued.codes}
                notice={issued.notice}
                heading="Your new recovery codes"
                confirmLabel="Done"
                onDone={done}
              />
            )}
          </Panel>
        ) : null}
      </div>
    </>
  );
}
