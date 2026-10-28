import { api } from './api';

/**
 * How much work is waiting, for the sidebar badges and the dashboard.
 *
 * ONE PLACE, BECAUSE THE STATUS VALUES DO NOT AGREE WITH EACH OTHER.
 *
 *   support tickets  ->  'OPEN'      (uppercase)
 *   SOS events       ->  'open'      (lowercase)
 *   withdrawals      ->  'pending'   (lowercase)
 *   drivers          ->  approved=false, not a status at all
 *
 * That is not a style quibble. `servers/support/views.py` filters with
 * `qs.filter(status=status_filter)` and validates nothing, so asking it for
 * `status=open` matches ZERO rows and returns a confident count of 0 while
 * tickets sit open. A badge reading "0" is worse than no badge: an operator
 * believes it and stops looking.
 *
 * So the queries live here, once, with the casing written down beside the
 * reason — and `null` means "we could not find out", which callers must
 * render as absent rather than as zero.
 */
export type QueueCounts = {
  driversAwaiting: number | null;
  withdrawalsPending: number | null;
  supportOpen: number | null;
  sosOpen: number | null;
};

export const EMPTY_COUNTS: QueueCounts = {
  driversAwaiting: null,
  withdrawalsPending: null,
  supportOpen: null,
  sosOpen: null,
};

/** `page_size=1` because only the envelope's `count` is wanted. */
async function countOf(path: string): Promise<number | null> {
  try {
    const page = await api.get<{ count?: number; results?: unknown[] }>(path);
    if (typeof page?.count === 'number') return page.count;
    // An endpoint that answers with a bare list has no total to give. Say
    // unknown rather than reporting the length of one page as the total.
    return null;
  } catch {
    return null;
  }
}

export const QUEUES = {
  // Not a status: a driver awaiting review is one that is not approved.
  driversAwaiting: '/driver/admin/?approved=false&page_size=1',
  withdrawalsPending: '/driver/admin/withdrawals/?status=pending&page_size=1',
  // UPPERCASE. See the note above — lowercase silently matches nothing.
  supportOpen: '/support/admin/tickets/?status=OPEN&page_size=1',
  sosOpen: '/sos/admin/?status=open&page_size=1',
} as const;

/**
 * Fetch every queue count. Independent on purpose: one failing leaves the
 * others alone and leaves its own count unknown.
 */
export async function fetchQueueCounts(): Promise<QueueCounts> {
  const [driversAwaiting, withdrawalsPending, supportOpen, sosOpen] =
    await Promise.all([
      countOf(QUEUES.driversAwaiting),
      countOf(QUEUES.withdrawalsPending),
      countOf(QUEUES.supportOpen),
      countOf(QUEUES.sosOpen),
    ]);
  return { driversAwaiting, withdrawalsPending, supportOpen, sosOpen };
}
