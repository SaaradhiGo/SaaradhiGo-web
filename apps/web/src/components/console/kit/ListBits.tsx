'use client';

import type { ReactNode } from 'react';
import type { ChipTone } from './StatusChip';

/**
 * Small parts the list + record pages share: the "More filters" fold, the
 * answer to the last action, and the record's loading / failure states.
 */

/** The older tones (good / bad / wait / neutral) as status-chip tones. Red stays for critical only. */
export function chipTone(tone: string | null | undefined, { badIsCritical = false } = {}): ChipTone {
  switch (tone) {
    case 'good': return 'good';
    case 'bad': return badIsCritical ? 'critical' : 'caution';
    case 'wait': return 'info';
    default: return 'neutral';
  }
}

/** Every filter the views do not cover, folded away until asked for. */
export function MoreFilters({ count = 0, children }: { count?: number; children: ReactNode }) {
  return (
    <details className="ops-more">
      <summary className="ops-more__toggle">More filters{count ? ` (${count})` : ''}</summary>
      <div className="ops-more__body">{children}</div>
    </details>
  );
}

/** What the last action did: done, or sent to a second approver. */
export function ActionNotice({ notice, onDismiss }: {
  notice: { text: ReactNode; kind: 'pending' | 'done' } | null; onDismiss?: () => void;
}) {
  if (!notice) return null;
  return (
    <div className={notice.kind === 'pending' ? 'ops-confirm ops-notice' : 'alert-success ops-notice'} role="status">
      <b>{notice.text}</b>
      {onDismiss ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onDismiss}>Dismiss</button> : null}
    </div>
  );
}

/** Inside a record tab: a label and a value, one per line. */
export function RecordFacts({ rows }: { rows: Array<[label: string, value: ReactNode] | null | false> }) {
  const shown = rows.filter((r): r is [string, ReactNode] => Boolean(r));
  return (
    <dl className="ops-recfacts">
      {shown.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

/** A heading inside a record tab. */
export function RecordSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ops-recsec" aria-label={title}>
      <div className="ops-recsec__head"><h3>{title}</h3>{action}</div>
      {children}
    </section>
  );
}

export function RecordLoading({ label }: { label: string }) {
  return (
    <aside className="ops-record" aria-label={label} aria-busy="true">
      <div className="ops-record__body"><p className="ops-record__empty">Loading…</p></div>
    </aside>
  );
}

export function RecordFailed({ label, message, onRetry, onClose }: {
  label: string; message: string; onRetry: () => void; onClose: () => void;
}) {
  return (
    <aside className="ops-record" aria-label={label}>
      <div className="ops-record__body">
        <p className="alert-error" role="alert">{message}</p>
        <div className="ops-record__actions">
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onRetry}>Try again</button>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </aside>
  );
}

/** The page header the list pages use, for overview pages that are not lists. */
export function PageHead({ title, summary, actions }: { title: string; summary?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ops-list__head mb-4">
      <div>
        <h1>{title}</h1>
        {summary ? <p>{summary}</p> : null}
      </div>
      {actions ? <div className="ops-list__actions">{actions}</div> : null}
    </header>
  );
}
