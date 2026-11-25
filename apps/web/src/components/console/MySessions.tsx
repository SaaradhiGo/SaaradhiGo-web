'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import { plural } from '@/components/console/kit/ListPage';
import { RecordSection } from '@/components/console/kit/ListBits';
import { StatusChip } from '@/components/console/kit/StatusChip';

/**
 * 25 Nov (owner): My security -- where I am signed in, sign out everywhere else, change my password.
 * Sessions are the caller's own (`/auth/sessions/`); the console's server tells the backend which
 * one is this browser. Changing the password ends every session, this one included.
 */
type Session = { id: number; started_at: string | null; expires_at: string; current: boolean };
type Sessions = { sessions: Session[]; count: number; this_session_known: boolean };

export function MySessions() {
  const [data, setData] = useState<Sessions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.get<Sessions>('/auth/sessions/');
      if (!d || !Array.isArray(d.sessions)) throw new Error('unexpected');
      setData(d);
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'We could not load your sessions.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function signOutOthers() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await api.post<{ sessions_ended: number }>('/auth/sessions/sign-out-others/', {});
      setNotice(r.sessions_ended ? `Signed out of ${plural(r.sessions_ended, 'other session')}.` : 'No other session was signed in.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const others = data ? data.sessions.filter((s) => !s.current).length : 0;
  return (
    <RecordSection title="Where you are signed in">
      {error ? <div className="alert-error" role="alert">{error}</div> : null}
      {notice ? <p className="ops-note" role="status">{notice}</p> : null}
      {data ? (
        <>
          <ul className="ops-list-plain" aria-label="Your sessions">
            {data.sessions.map((s) => (
              <li key={s.id} className="ops-chips">
                <span>Signed in {stamp(s.started_at)} · ends {stamp(s.expires_at)}</span>
                {s.current ? <StatusChip tone="good">This browser</StatusChip> : null}
              </li>
            ))}
          </ul>
          <p className="ops-fact__note">
            {plural(data.count, 'session')} in all. A session lasts up to 14 days unless you sign out.
          </p>
          <div className="ops-form__row">
            <button type="button" className="sg-btn sg-btn--secondary" disabled={busy || others === 0 || !data.this_session_known}
              onClick={() => void signOutOthers()}>
              {busy ? 'Signing out…' : 'Sign out everywhere else'}
            </button>
          </div>
          {!data.this_session_known ? <p className="help">This browser could not be matched to a session. Sign out and in again first.</p> : null}
        </>
      ) : null}
    </RecordSection>
  );
}

export function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { setError('Use at least 8 characters.'); return; }
    if (next !== again) { setError('The two new passwords are not the same.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password/change/', { current_password: current, new_password: next });
      setDone(true);
      setCurrent(''); setNext(''); setAgain('');
      // Every session ends with the old password, this one too: sign in again with the new one.
      setTimeout(() => { window.location.assign('/ops/login'); }, 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RecordSection title="Change your password">
      {done ? (
        <p className="ops-note" role="status">Your password has been changed. Every session has ended; sign in again with the new password.</p>
      ) : (
        <form className="login__form" onSubmit={submit} noValidate aria-label="Change your password">
          {error ? <div className="alert-error" role="alert">{error}</div> : null}
          <div className="login__field">
            <label htmlFor="pw-current">Current password</label>
            <input id="pw-current" type="password" className="input" autoComplete="current-password" value={current}
              onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="login__field">
            <label htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" className="input" autoComplete="new-password" value={next}
              onChange={(e) => setNext(e.target.value)} aria-describedby="pw-new-hint" required />
            <p className="login__hint" id="pw-new-hint">At least 8 characters, not a common one. Every session ends, this one too.</p>
          </div>
          <div className="login__field">
            <label htmlFor="pw-again">New password again</label>
            <input id="pw-again" type="password" className="input" autoComplete="new-password" value={again}
              onChange={(e) => setAgain(e.target.value)} required />
          </div>
          <div className="ops-form__row">
            <button type="submit" className="sg-btn sg-btn--primary" disabled={busy || !current || !next}>
              {busy ? 'Changing…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </RecordSection>
  );
}
