'use client';

import { useEffect, useRef, useState } from 'react';
import { useTr } from '@/i18n/website';
import { ApiError } from '@/lib/api';
import { changePhone } from '@/lib/area/rider';
import { messageFor, sendPublicOtp } from '@/lib/publicAuth';

/** The calling code from the ride's city (11 Nov): +91 in India, +1 in the USA. */
const CALLING: Record<string, { code: string; digits: number }> = { IN: { code: '91', digits: 10 }, US: { code: '1', digits: 10 } };
const RESEND_AFTER_S = 30;

/**
 * The mobile number, asked once, at the first booking (Srini's ruling, 11 Nov). A 6-digit code
 * proves it; Resend comes after 30 s. Once verified it is never asked again (Account changes it).
 */
export function PhoneStep({ country, onDone, onClose }: { country: string; onDone: () => void; onClose: () => void }) {
  const tr = useTr();
  const calling = CALLING[country] ?? CALLING.IN;
  const [national, setNational] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: 'phone' | 'code'; text: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const digits = national.replace(/\D/g, '');
  const phone = `+${calling.code}${digits}`;

  async function send() {
    setError(null);
    if (digits.length !== calling.digits) {
      setError({ field: 'phone', text: tr('Enter your {n}-digit mobile number.').replace('{n}', String(calling.digits)) });
      return;
    }
    setBusy(true);
    try {
      await sendPublicOtp(phone, 'rider');
      setSent(true);
      setWait(RESEND_AFTER_S);
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch (err) {
      const off = err instanceof ApiError && err.code === 'OTP_SENDING_DISABLED';
      setError({ field: 'phone', text: off ? tr('This number cannot get a code here. Use an approved test number.')
        : messageFor(err, tr('We could not send the code. Try again.')) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!sent) { await send(); return; }
    if (!/^\d{6}$/.test(code.trim())) { setError({ field: 'code', text: tr('Enter the 6-digit code.') }); return; }
    setBusy(true);
    setError(null);
    try {
      await changePhone(phone, code.trim());
      onDone();
    } catch (err) {
      const taken = err instanceof ApiError && err.code === 'AUTH_PHONE_TAKEN';
      setError({ field: taken ? 'phone' : 'code', text: messageFor(err, tr('That code did not work.')) });
      if (taken) { setSent(false); setCode(''); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="asheet-scrim" onClick={onClose}>
      <form className="asheet" role="dialog" aria-modal="true" aria-labelledby="phone-step-title" onSubmit={confirm}
        onClick={(e) => e.stopPropagation()} noValidate data-testid="phone-step">
        <h2 className="a20" id="phone-step-title">{tr('Add your mobile number')}</h2>
        <p className="a14 amut">{tr('Your driver needs it to reach you at the pickup. We ask once.')}</p>
        <label className="acol" style={{ gap: 6 }}>
          <span className="a14 ab">{tr('Mobile number')}</span>
          <span className={`afield afield--on${error?.field === 'phone' ? ' afield--bad' : ''}`}>
            <span className="ab" aria-hidden="true">+{calling.code}</span>
            <input value={national} onChange={(e) => { setNational(e.target.value); setSent(false); }} inputMode="tel"
              autoComplete="tel-national" autoFocus aria-label={tr('Mobile number')} aria-invalid={error?.field === 'phone' || undefined}
              aria-describedby={error?.field === 'phone' ? 'phone-step-err' : undefined} data-testid="phone-input" />
          </span>
        </label>
        {error?.field === 'phone' && <p id="phone-step-err" className="a14 ared">{error.text}</p>}
        {sent && (
          <>
            <label className="acol" style={{ gap: 6 }}>
              <span className="a14 ab">{tr('Code sent to {phone}').replace('{phone}', `+${calling.code} ${digits}`)}</span>
              <span className={`afield afield--on${error?.field === 'code' ? ' afield--bad' : ''}`}>
                <input ref={codeRef} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6}
                  autoComplete="one-time-code" aria-label={tr('6-digit code')} aria-invalid={error?.field === 'code' || undefined}
                  aria-describedby={error?.field === 'code' ? 'code-step-err' : undefined} data-testid="code-input" />
              </span>
            </label>
            {error?.field === 'code' && <p id="code-step-err" className="a14 ared">{error.text}</p>}
            {wait > 0 ? (
              <p className="a14 amut" aria-live="polite">{tr('Resend in {n} s').replace('{n}', String(wait))}</p>
            ) : (
              <button type="button" className="a14 ab aacc" onClick={send} disabled={busy}
                style={{ alignSelf: 'flex-start', background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
                {tr('Resend code')}
              </button>
            )}
          </>
        )}
        <div className="arow" style={{ gap: 8 }}>
          <button type="button" className="abtn abtn--ghost" onClick={onClose}>{tr('Cancel')}</button>
          {/* Dark, not orange: the page's Book stays the one orange button on screen. */}
          <button type="submit" className="abtn abtn--dark agrow" disabled={busy}>
            {busy ? tr('Please wait…') : sent ? tr('Verify and book') : tr('Send code')}
          </button>
        </div>
      </form>
    </div>
  );
}
