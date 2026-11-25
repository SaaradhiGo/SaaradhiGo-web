'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

/**
 * The daily report email (owner ruling, 25 Nov): yesterday's numbers for your cities at 08:00 local.
 * It goes out once email (SES) is live; until then the page says so and nothing is received.
 */
type State = { subscribed: boolean; email_live: Record<string, boolean>; send_hour: number };

export function DailyEmail() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<State>('/reports/admin/daily-email/')
      .then((d) => setState(d && typeof d.subscribed === 'boolean' ? d : null)).catch(() => setState(null));
  }, []);
  if (!state) return null;
  const live = Object.values(state.email_live ?? {}).some(Boolean);
  async function toggle() {
    if (!state) return;
    setBusy(true); setError(null);
    try {
      setState(await api.post<State>('/reports/admin/daily-email/', { subscribed: !state.subscribed }));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally { setBusy(false); }
  }
  return (
    <div className="ops-note mb-3 ops-row-actions" role="group" aria-label="Daily report email">
      <span>
        <b>Daily report email:</b> {state.subscribed ? `on, at ${String(state.send_hour).padStart(2, '0')}:00 in each city` : 'off'}.
        {' '}{live ? '' : 'Email is not live yet (it starts once the email provider is set up), so nothing is received until then.'}
      </span>
      <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => void toggle()} disabled={busy}>
        {state.subscribed ? 'Stop the email' : 'Email me the daily report'}
      </button>
      {error ? <span className="alert-error" role="alert">{error}</span> : null}
    </div>
  );
}
