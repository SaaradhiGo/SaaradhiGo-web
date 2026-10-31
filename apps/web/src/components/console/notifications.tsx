'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { Empty } from '@/components/console/ui';

/**
 * The four Notifications pages share one sub-navigation. All four open with `notify.read`, so
 * it is drawn whole or not at all (the link rule): an operator without the capability never
 * sees a tab that would 403.
 */
const TABS = [
  { href: '/notifications', label: 'Templates' },
  { href: '/notifications/campaigns', label: 'Campaigns' },
  { href: '/notifications/delivery', label: 'Delivery log' },
  { href: '/notifications/providers', label: 'Providers' },
] as const;

export function NotificationsNav() {
  const pathname = usePathname() ?? '';
  const access = useAdminAccess();
  if (!canOpen(access, 'notifications')) return null;
  const current = TABS.find((t) => (t.href === '/notifications'
    ? pathname === t.href
    : pathname === t.href || pathname.startsWith(`${t.href}/`)))?.href;
  return (
    <nav className="ops-subnav" aria-label="Notifications">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="ops-subnav__link"
          aria-current={current === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** What a page shows to an operator who cannot read notifications (reached by a typed URL). */
export function NoAccess() {
  return (
    <Empty title="Notifications are not available to your role"
      detail="Templates, campaigns and the delivery log open with the notify.read capability." />
  );
}

/** The "Sent for approval" / "Done" banner every page shows after a write. */
export type Notice = { text: string; kind: 'pending' | 'done' };

export function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
      <b>{notice.text}</b>
    </div>
  );
}

/** A server refusal is shown as written; anything else gets a plain sentence. */
export function messageOf(err: unknown, fallback: string): string {
  const e = err as { fromServer?: boolean; message?: string } | null;
  return e && e.fromServer && e.message ? e.message : fallback;
}
