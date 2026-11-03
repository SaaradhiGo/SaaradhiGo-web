'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/**
 * The everyday pattern, record half (design board B): everything about one
 * trip, driver, rider, payout or ticket, beside the list it was opened from.
 *
 * A header with the name, the readable ID, a status in words, and the quick
 * actions; then tabs; the History tab is the record's timeline. The panel is a
 * complementary region the list can stay usable beside, and Escape closes it.
 */
export type RecordTab = { key: string; label: string; content: ReactNode };
export type HistoryEntry = { at: string; text: ReactNode; who?: string | null };

export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-zऀ-ॿ ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
}

export function RecordPanel({
  title, refId, subtitle, status, actions, tabs, onClose, label,
}: {
  title: string;
  refId?: string | null;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  tabs: RecordTab[];
  onClose?: () => void;
  label: string;
}) {
  const [tab, setTab] = useState(tabs[0]?.key ?? '');
  const id = useId();
  // Back to the first tab when a DIFFERENT record opens -- not on mount: the effect can
  // run after the first paint, and resetting then undid a tab the operator had already clicked.
  const shown = useRef(`${title}|${refId ?? ''}`);
  useEffect(() => {
    const now = `${title}|${refId ?? ''}`;
    if (shown.current === now) return;
    shown.current = now;
    setTab(tabs[0]?.key ?? '');
  }, [title, refId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  return (
    <aside className="ops-record" aria-label={label}>
      <header className="ops-record__head">
        <div className="ops-record__who">
          <span className="ops-record__avatar" aria-hidden="true">{initials(title)}</span>
          <div>
            <div className="ops-record__title">
              {title} {refId ? <span className="ops-record__ref sg-num">{refId}</span> : null}
            </div>
            {subtitle ? <div className="ops-record__sub">{subtitle}</div> : null}
            {status ? <div className="ops-record__status">{status}</div> : null}
          </div>
          {onClose ? (
            <button type="button" className="ops-record__close" aria-label="Close" onClick={onClose}>×</button>
          ) : null}
        </div>
        {actions ? <div className="ops-record__actions">{actions}</div> : null}
        <div className="ops-record__tabs" role="tablist" aria-label={`${label} sections`}>
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" id={`${id}-${t.key}`} aria-selected={t.key === current?.key}
              aria-controls={`${id}-panel`} className="ops-record__tab" onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="ops-record__body" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${current?.key}`}>
        {current?.content}
      </div>
    </aside>
  );
}

/** A record's history: newest first, each line with when and who. */
export function History({ entries, empty = 'Nothing recorded yet.' }: { entries: HistoryEntry[]; empty?: string }) {
  if (entries.length === 0) return <p className="ops-record__empty">{empty}</p>;
  return (
    <ol className="ops-history">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <span className="ops-history__at sg-num">{e.at}</span>
          <span className="ops-history__text">{e.text}{e.who ? <span className="ops-history__who"> · {e.who}</span> : null}</span>
        </li>
      ))}
    </ol>
  );
}

/** A labelled figure inside a record (RATING 4.42 · City usual 4.78). */
export function RecordStat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="ops-record__stat">
      <div className="ops-record__stat-label">{label}</div>
      <div className="ops-record__stat-value sg-num">{value}</div>
      {note ? <div className="ops-record__stat-note">{note}</div> : null}
    </div>
  );
}
