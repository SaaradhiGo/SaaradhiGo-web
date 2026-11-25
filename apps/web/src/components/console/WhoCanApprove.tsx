'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { plural } from '@/components/console/kit/ListPage';

/** 25 Nov (owner): who can approve what. A checker's role holds approval.check and the action's own
 *  capability, in the request's place; the maker can never check their own request. */
type Checker = { role: string; name: string; people: number };
type Action = { key: string; description: string; capability: string; always_checker: boolean; checkers?: Checker[] };

export function WhoCanApprove() {
  const [actions, setActions] = useState<Action[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (actions) return;
    try {
      const d = await api.get<{ actions: Action[] }>('/approvals/admin/policies/');
      setActions(d.actions);
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'This list could not be loaded.');
    }
  }

  return (
    <details className="ops-card" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load(); }}>
      <summary><b>Who can approve what</b></summary>
      <p className="ops-prose">A request is checked by someone else whose role may approve and may do the action itself, in that place.</p>
      {error ? <div className="alert-error" role="alert">{error}</div> : null}
      {actions ? (
        <ul className="ops-list-plain" aria-label="Who can approve each action">
          {actions.map((a) => (
            <li key={a.key}>
              <b>{a.description}</b>
              {a.always_checker ? <span className="muted"> · always needs a second person</span> : null}
              <div className="help">
                {a.checkers && a.checkers.length
                  ? a.checkers.map((c) => `${c.name} (${plural(c.people, 'person', 'people')})`).join(', ')
                  : 'Super Admin only'}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
