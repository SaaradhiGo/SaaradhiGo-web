import type { ChipTone } from '@/components/console/kit/StatusChip';

/**
 * Small glue between the older pages' words and the list kit.
 *
 * The older modules name a status tone good / bad / wait / neutral. On the
 * new pattern red is for critical only, so "bad" (failed, rejected, used up)
 * reads as caution, "wait" as info.
 */
export type LegacyTone = 'good' | 'bad' | 'wait' | 'neutral';

export function chipToneOf(tone: LegacyTone): ChipTone {
  switch (tone) {
    case 'good': return 'good';
    case 'bad': return 'caution';
    case 'wait': return 'info';
    default: return 'neutral';
  }
}

/** The views for a list filtered by one status value; the active view carries the server's count. */
export function viewsOf<S extends string>(
  values: readonly S[], label: (s: S) => string, current: string, count: number | null | undefined, allLabel = 'All',
): Array<{ key: string; label: string; count?: number | null }> {
  return [
    { key: '', label: allLabel, count: current === '' ? count ?? null : undefined },
    ...values.map((s) => ({ key: s, label: label(s), count: current === s ? count ?? null : undefined })),
  ];
}

/** A page's limit/offset from a 1-based page number. */
export function pageQuery(page: number, size: number): { limit: string; offset: string } {
  return { limit: String(size), offset: String(Math.max(0, (page - 1) * size)) };
}
