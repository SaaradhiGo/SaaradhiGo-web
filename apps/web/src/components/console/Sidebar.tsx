'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { Logo } from '@/components/sg/Logo';
import { ChevronLeft, PanelLeft } from '@/components/console/icons';

export type NavItem = {
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  /** The permission that governs the page. Hides the link; the server refuses the page. */
  need: string;
  /** Which queue count sits beside it, if any. */
  countKey?: string;
  /** Red rather than gold when non-zero: things with a clock on them. */
  urgent?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

/**
 * The noir rail.
 *
 * It stays black in BOTH themes, like the public site's nav: the brand sits
 * on noir and the work area changes around it. `sg-on-noir` is what makes
 * the mark gold and the controls legible there whatever the page theme.
 *
 * COLLAPSED, IT IS STILL THE SAME NAV. The labels go, the icons stay, each
 * link keeps its accessible name through `title` and `aria-label`, and the
 * counts shrink to a dot-with-a-number rather than vanishing -- an operator
 * who collapses the rail to make room for a table has not asked to stop
 * being told about an SOS.
 *
 * `nav[aria-label="Console"]` and `.ops__link` are read by
 * scripts/verify-scope.mjs; both stay.
 */
export function Sidebar({
  groups,
  counts,
  collapsed,
  onToggle,
  isCurrent,
}: {
  groups: NavGroup[];
  counts: Record<string, number | undefined>;
  collapsed: boolean;
  onToggle: () => void;
  isCurrent: (href: string) => boolean;
}) {
  return (
    <aside className="ops__side sg-on-noir" aria-label="Sidebar">
      {/* Named by its own text while that text is visible; only the
          collapsed rail, where the words are hidden, needs a label. */}
      <Link href="/dashboard" className="ops__brand" aria-label={collapsed ? 'Saaradhi Go Admin, home' : undefined}>
        <Logo variant="emblem" />
        <span className="ops__wordmark">
          Saaradhi Go
          <small>Admin</small>
        </span>
      </Link>

      <nav aria-label="Console" className="ops__nav">
        {groups.map((group) => (
          <div className="ops__group" key={group.label} role="group" aria-label={group.label}>
            <div className="ops__group-label">{group.label}</div>
            {group.items.map((item) => {
              const count = item.countKey ? counts[item.countKey] : undefined;
              const has = typeof count === 'number' && count > 0;
              const name = has ? `${item.label}, ${count} waiting` : item.label;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ops__link"
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  aria-label={collapsed ? name : undefined}
                  title={collapsed ? name : undefined}
                >
                  <item.Icon />
                  <span className="ops__link-label">{item.label}</span>
                  {has && (
                    <span
                      className={`ops__count ${item.urgent ? 'ops__count--urgent' : ''}`}
                      aria-hidden={collapsed ? undefined : 'true'}
                      aria-label={collapsed ? undefined : `${count} waiting`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="ops__collapse"
        onClick={onToggle}
        aria-pressed={collapsed}
        aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
        title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
      >
        {collapsed ? <PanelLeft /> : <ChevronLeft />}
        <span className="ops__link-label">Collapse</span>
      </button>
    </aside>
  );
}
