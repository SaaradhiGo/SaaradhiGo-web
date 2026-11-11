'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, can } from '@/lib/adminScope';
import type { Handoff } from '@/lib/fraud';

/**
 * The hand-offs from a confirmed flag: links to actions that already exist in other modules (suspend
 * a driver, request deactivation, block or flag a rider, a Finance adjustment). Only the ones this
 * operator holds the capability for are drawn (the link rule), and choosing one records the choice
 * on the flag and then opens the page that does the work. This component performs no action itself.
 */
export function HandoffButtons({ flagId, handoffs }: { flagId: number; handoffs: Handoff[] }) {
  const router = useRouter();
  const access = useAdminAccess();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = handoffs.filter((h) => h.available && can(access, h.capability));
  if (shown.length === 0) return null;

  async function take(h: Handoff) {
    setBusy(h.kind); setError(null);
    try {
      await api.post(`/fraud/admin/flags/${flagId}/handoff/`, { kind: h.kind });
      router.push(h.href);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That could not be recorded.');
      setBusy(null);
    }
  }

  return (
    <div className="fr-handoffs">
      <div className="ops-actions" role="group" aria-label="Hand-offs">
        {shown.map((h) => (
          <button key={h.kind} type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
            disabled={busy !== null} onClick={() => void take(h)}>
            {busy === h.kind ? 'Opening…' : h.label}
            {h.taken_at ? ' (taken)' : ''}
          </button>
        ))}
      </div>
      {error ? <div className="alert-error" role="alert">{error}</div> : null}
    </div>
  );
}
