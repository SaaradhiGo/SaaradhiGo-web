'use client';

import type { ReactNode } from 'react';

import {
  ackRemaining, ackText, ageText, cellSentence, sosLabel, TRIP_STATE_WORDS,
  type QueueItem, type QueueTab,
} from '@/lib/liveOps';

/**
 * The "Needs attention" queue. Collapses to a 44 px rail; the caller remembers the choice.
 * Each item is a button, so everything in the queue is reachable by keyboard.
 */
const TABS: { key: QueueTab; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'safety', label: 'Safety' },
  { key: 'trips', label: 'Trips' }, { key: 'supply', label: 'Supply' },
];

export function AttentionQueue({
  items, total, tab, onTab, collapsed, onToggle, selectedKey, onOpen, now, windowMinutes, tabs, footer,
}: {
  items: QueueItem[];
  total: number;
  tab: QueueTab;
  onTab: (t: QueueTab) => void;
  collapsed: boolean;
  onToggle: () => void;
  selectedKey: string | null;
  onOpen: (item: QueueItem) => void;
  now: number;
  windowMinutes: number;
  tabs: QueueTab[];
  footer?: ReactNode;
}) {
  if (collapsed) {
    return (
      <aside className="lo-queue lo-queue--rail" aria-label="Needs attention">
        <button type="button" className="lo-queue__toggle" aria-expanded={false} aria-label="Show the needs attention queue" onClick={onToggle}>
          ›<span className="lo-queue__n">{total}</span>
        </button>
        {footer}
      </aside>
    );
  }
  return (
    <aside className="lo-queue" aria-label="Needs attention">
      <div className="lo-queue__head">
        <h2>Needs attention <span>{total}</span></h2>
        <button type="button" className="lo-queue__toggle" aria-expanded aria-label="Hide the needs attention queue" onClick={onToggle}>‹</button>
      </div>
      <div className="ops-tabs" role="tablist" aria-label="Queue filter">
        {TABS.filter((t) => tabs.includes(t.key)).map((t) => (
          <button key={t.key} type="button" role="tab" className="ops-tab" aria-selected={tab === t.key} onClick={() => onTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <ul className="lo-queue__list">
        {items.length === 0 ? <li className="lo-queue__empty">Nothing needs attention here.</li> : null}
        {items.map((item) => {
          const { alert, trip, cell } = item;
          const rem = alert ? ackRemaining(alert.ack_due_at, now) : null;
          return (
            <li key={item.key}>
              <button
                type="button" className={`lo-q lo-q--${item.kind}`} aria-current={selectedKey === item.key}
                onClick={() => onOpen(item)}
              >
                {alert ? (
                  <>
                    <b>{item.kind === 'sos' ? `${sosLabel(alert)} · ` : ''}{alert.title}</b>
                    {item.kind === 'sos' && rem !== null
                      ? <span className={rem < 0 ? 'lo-late' : 'lo-q__sub'}>{ackText(rem)}</span>
                      : <span className="lo-q__sub">{alert.severity} · {ageText((now - Date.parse(alert.created_at)) / 1000)} ago</span>}
                  </>
                ) : null}
                {trip ? (
                  <>
                    <b>{item.kind === 'stale' ? 'Stuck trip' : 'Waiting for a driver'} · T-{trip.id}</b>
                    <span className="lo-q__sub">{TRIP_STATE_WORDS[trip.state] ?? trip.state} · {ageText(trip.age_s)}</span>
                  </>
                ) : null}
                {cell ? (
                  <>
                    <b>Short of drivers</b>
                    <span className="lo-q__sub">{cellSentence(cell, windowMinutes).replace(/^Cell near /, '')}</span>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {footer}
    </aside>
  );
}
