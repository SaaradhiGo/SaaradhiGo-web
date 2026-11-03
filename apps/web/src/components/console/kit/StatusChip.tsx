import type { ReactNode } from 'react';
import type { Health, Severity } from '@/lib/workspace';

/**
 * Status as a word AND a colour, never colour alone (owner, 2026-11-03):
 * red = critical only, caution (amber) = watch / high, info (blue) = waiting /
 * low, green = done or healthy, grey = neutral or quiet.
 */
export type ChipTone = 'critical' | 'caution' | 'info' | 'good' | 'neutral';

const CLASS: Record<ChipTone, string> = {
  critical: 'ops-pill ops-pill--bad',
  caution: 'ops-pill ops-pill--caution',
  info: 'ops-pill ops-pill--info',
  good: 'ops-pill ops-pill--good',
  neutral: 'ops-pill',
};

export function StatusChip({ tone, children, title }: { tone: ChipTone; children: ReactNode; title?: string }) {
  return <span className={CLASS[tone]} title={title}>{children}</span>;
}

export const SEVERITY_TONE: Record<Severity, ChipTone> = { critical: 'critical', high: 'caution', waiting: 'info' };
export const HEALTH_TONE: Record<Health, ChipTone> = { critical: 'critical', watch: 'caution', normal: 'good', quiet: 'neutral' };

export function SeverityChip({ severity }: { severity: Severity }) {
  const word = severity === 'critical' ? 'Critical' : severity === 'high' ? 'High' : 'Waiting';
  return <StatusChip tone={SEVERITY_TONE[severity]}>{word}</StatusChip>;
}

export function HealthChip({ health, reason }: { health: Health; reason?: string }) {
  const word = health === 'critical' ? 'Critical' : health === 'watch' ? 'Watch' : health === 'normal' ? 'Normal' : 'Quiet';
  return <StatusChip tone={HEALTH_TONE[health]} title={reason || undefined}>{word}</StatusChip>;
}
