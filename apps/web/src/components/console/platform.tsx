'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { mayDecide, pendingWords, visibleTabs, type Pending } from '@/lib/platform';
import { Empty, Panel } from '@/components/console/ui';
import { messageOf, type Notice } from '@/components/console/notifications';

/**
 * The Platform Settings pages share one sub-navigation, drawn from what the operator holds
 * (the link rule): a tab that would 403 is never drawn.
 */
export function PlatformNav() {
  const pathname = usePathname() ?? '';
  const access = useAdminAccess();
  const tabs = visibleTabs(access);
  if (tabs.length === 0) return null;
  const current = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href;
  return (
    <nav className="ops-subnav" aria-label="Platform settings">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className="ops-subnav__link" aria-current={current === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** What a page shows to an operator who cannot open it (reached by a typed URL). */
export function PlatformNoAccess({ what = 'This page' }: { what?: string }) {
  return (
    <Empty title={`${what} is not available to your role`}
      detail="Platform settings open with the platform.read, platform.settings, platform.integrations.read or audit.read capability." />
  );
}

/**
 * Requests waiting for a checker. A request from somebody else can be approved or declined here by
 * an operator who holds `approval.check`; the server re-checks everything (the checker must hold
 * platform.settings too, and cannot be the maker), and a launch is re-checked against the
 * readiness checklist at the moment of approval.
 */
export function PendingRequests({ title = 'Waiting for a second admin', items, onDecided, describe = pendingWords }: {
  title?: string;
  items: Pending[];
  onDecided: (n: Notice) => void;
  describe?: (p: Pending) => string;
}) {
  const access = useAdminAccess();
  const noteId = useId();
  const [note, setNote] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function decide(p: Pending, verb: 'approve' | 'reject') {
    const text = (note[p.id] ?? '').trim();
    if (verb === 'reject' && text.length < 3) { setProblem('Say why you are declining, in a few words.'); return; }
    setBusy(p.id); setProblem(null);
    try {
      const out = await api.post<{ status?: string; error_code?: string; error?: string }>(
        `/approvals/admin/requests/${p.id}/${verb}/`, { reason: text || 'Approved' });
      if (verb === 'approve' && out?.status === 'failed') {
        onDecided({ text: `Approved, but it could not be applied: ${out.error || out.error_code || 'refused'}`, kind: 'done' });
      } else {
        onDecided({ text: verb === 'approve' ? 'Approved and applied.' : 'Declined. Nothing changed.', kind: 'done' });
      }
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing changed.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title={title}>
      {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
      <ul className="ps-requests">
        {items.map((p) => {
          const may = mayDecide(access, p);
          return (
            <li key={p.id} className="ps-request">
              <div>
                <b>{describe(p)}</b>
                <span className="muted"> · request #{p.id} from {p.maker_label || 'staff'}{p.requested_at ? `, ${stamp(p.requested_at)}` : ''}</span>
                <p className="help mb-0">{p.reason}</p>
              </div>
              {may ? (
                <div className="nf-inline">
                  <label className="sr-only" htmlFor={`${noteId}-${p.id}`}>Note for request {p.id}</label>
                  <input id={`${noteId}-${p.id}`} className="input" placeholder="Note (required to decline)"
                    value={note[p.id] ?? ''} onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))} />
                  <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy === p.id}
                    onClick={() => void decide(p, 'approve')}>Approve</button>
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy === p.id}
                    onClick={() => void decide(p, 'reject')}>Decline</button>
                </div>
              ) : (
                <span className="muted">A different admin who holds approval.check decides this.</span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** A write's outcome as the banner every page shows: sent for approval, or done. */
export function outcomeNotice(
  out: { state?: string; approval_request?: { id: number } | null } | null | undefined, done: string,
): Notice {
  if (out?.state === 'pending_approval') {
    return { text: `Sent for approval · request #${out.approval_request?.id ?? ''}. Nothing changes until a second admin approves.`, kind: 'pending' };
  }
  return { text: done, kind: 'done' };
}
