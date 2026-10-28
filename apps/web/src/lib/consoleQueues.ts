import { api } from './api';
import { AdminAccess, can, withScope } from '@/lib/adminScope';

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
/**
 * Which queue each badge needs permission to count.
 *
 * Without this the sidebar asked for every queue on every page load, so a
 * City Ops Manager -- who holds no `finance.read` -- fired a request that
 * answered 403 and logged a console error on EVERY page, for most roles.
 * Found by driving the console in a browser as four different operators.
 *
 * It is not a security measure: the endpoint refuses them either way.
 * It stops the console asking questions it already knows the answer to.
 */
const QUEUE_PERMISSION = {
  driversAwaiting: 'driver.read',
  withdrawalsPending: 'finance.read',
  supportOpen: 'support.read',
  sosOpen: 'safety.respond',
} as const;

export async function fetchQueueCounts(
  access?: AdminAccess | null,
): Promise<QueueCounts> {
  // The badges must agree with the pages they link to. A count taken
  // across every region beside a list showing one city is worse than no
  // count at all: the operator chases a driver who is not on their list.
  //
  // `withScope` is a no-op when no region is selected, and the server
  // refuses a region the caller does not hold, so the count can never be
  // wider than what the operator may see.
  // `can` returns true when access is unknown, so a failed lookup counts
  // everything and the badges degrade to how they behaved before.
  const allowed = (key: keyof typeof QUEUE_PERMISSION) =>
    can(access ?? null, QUEUE_PERMISSION[key]);

  const skip = Promise.resolve(null);

  const [driversAwaiting, withdrawalsPending, supportOpen, sosOpen] =
    await Promise.all([
      allowed('driversAwaiting')
        ? countOf(withScope(QUEUES.driversAwaiting)) : skip,
      allowed('withdrawalsPending')
        ? countOf(withScope(QUEUES.withdrawalsPending)) : skip,
      // Support and SOS are not scope-filtered server-side yet, so they
      // are deliberately NOT given a scope parameter -- sending one the
      // endpoint ignores would make the badge look region-aware when it
      // is not. They scope when their endpoints do.
      allowed('supportOpen') ? countOf(QUEUES.supportOpen) : skip,
      allowed('sosOpen') ? countOf(QUEUES.sosOpen) : skip,
    ]);
  return { driversAwaiting, withdrawalsPending, supportOpen, sosOpen };
}
