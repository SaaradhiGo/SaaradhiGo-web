'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import { useSite } from '@/i18n/site';
import { useTr } from '@/i18n/website';
import { ApiError } from '@/lib/api';
import { looksLikeEmail, messageFor, registerRider } from '@/lib/publicAuth';
import { safeReturnTo } from '@/lib/returnTo';

const FIELDS: Record<string, 'fullName' | 'email' | 'password'> = {
  full_name: 'fullName', email: 'email', password: 'password',
};

/**
 * Rider sign-up (11 Nov, Srini's ruling): full name, email and a password of 10 or more
 * characters, and the account works straight away. The mobile number is asked once, at the
 * first booking. Every error shows under its field; a taken email offers Log in and Forgot
 * password. Drivers keep RegisterForm.
 */
export default function RiderSignUpForm() {
  const tr = useTr();
  const auth = useSite().auth;
  const search = useSearchParams();
  const next = safeReturnTo(search.get('next'), '/ride');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'fullName' | 'email' | 'password', string>>>({});
  const [taken, setTaken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setTaken(false);
    const found: typeof errors = {};
    if (!fullName.trim()) found.fullName = tr('Tell us what to call you.');
    if (!looksLikeEmail(email)) found.email = tr('Enter a valid email address.');
    if (password.length < 10) found.password = tr('Use at least 10 characters.');
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await registerRider({ fullName, email, password });
      window.location.assign(next);
    } catch (err) {
      const field = err instanceof ApiError && err.field ? FIELDS[err.field] : undefined;
      const message = messageFor(err, tr('We could not create the account. Please try again.'));
      if (err instanceof ApiError && err.code === 'AUTH_EMAIL_IN_USE') {
        setTaken(true);
        setErrors({ email: tr('This email already has an account.') });
      } else if (field) {
        setErrors({ [field]: message });
      } else {
        setFormError(message);
      }
      setBusy(false);
    }
  }

  const back = `?next=${encodeURIComponent(next)}`;
  return (
    <form onSubmit={submit} className="s-form" noValidate>
      {formError && <Alert kind="error">{formError}</Alert>}
      <Field label={tr('Full name')} name="fullName" autoComplete="name" value={fullName}
        onChange={(e) => setFullName(e.target.value)} error={errors.fullName} required />
      <Field label={tr('Email')} name="email" type="email" autoComplete="email" value={email}
        onChange={(e) => { setEmail(e.target.value); setTaken(false); }} error={errors.email} required />
      {taken && (
        <p className="s-help" data-testid="email-taken">
          <Link href={`/sign-in${back}`}>{tr('Log in')}</Link>
          {' · '}
          <Link href="/forgot-password">{tr('Forgot password?')}</Link>
        </p>
      )}
      <Field label={tr('Password')} name="password" type="password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} error={errors.password}
        help={tr('At least 10 characters.')} required />
      <SubmitButton busy={busy} busyLabel={tr('Creating your account…')}>{tr('Create account')}</SubmitButton>
      <p className="s-auth__fine">
        {auth.agree.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
          part === '{terms}' ? <Link key={i} href="/terms">{auth.terms}</Link>
            : part === '{privacy}' ? <Link key={i} href="/privacy">{auth.privacy}</Link>
              : <span key={i}>{part}</span>)}
      </p>
    </form>
  );
}
