'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import {
  SEVERITY_WORDS, STATUS_WORDS, severityTone, statusTone, type Severity, type Status,
} from '@/lib/fraud';
import { Empty, Pill } from '@/components/console/ui';

/**
 * The two Fraud & Risk pages share one sub-navigation: the review Queue and the detection Rules.
 * Both open with `fraud.read`; a page is only drawn when it would open (the link rule).
 */
const TABS = [
  { href: '/fraud', label: 'Queue' },
  { href: '/fraud/rules', label: 'Rules' },
] as const;

export function FraudNav() {
  const pathname = usePathname() ?? '';
  const access = useAdminAccess();
  if (!canOpen(access, 'fraud')) return null;
  const onRules = pathname === '/fraud/rules' || pathname.startsWith('/fraud/rules/');
  const current = onRules ? '/fraud/rules' : '/fraud';
  return (
    <nav className="ops-subnav" aria-label="Fraud and risk">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="ops-subnav__link"
          aria-current={current === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** What a page shows to an operator who cannot read fraud flags (reached by a typed URL). */
export function NoFraudAccess() {
  return (
    <Empty title="Fraud & Risk is not available to your role"
      detail="The review queue and the detection rules open with the fraud.read capability." />
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return <Pill tone={severityTone(severity)}>{SEVERITY_WORDS[severity] ?? severity}</Pill>;
}

export function StatusPill({ status }: { status: Status }) {
  return <Pill tone={statusTone(status)}>{STATUS_WORDS[status] ?? status}</Pill>;
}
