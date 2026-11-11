import type { AdminAccess } from '@/lib/adminScope';
import { canOpenAt } from '@/lib/consoleLinks';

/**
 * Which links and queues a city's board may draw for this operator.
 *
 * One answer, used by the board and by the header's "waiting on you" count,
 * so the header never counts work the board does not show (the link rule,
 * AUDIT 27.40). Asked PER CITY: a role held at another city must not draw a
 * link here.
 */
export type BoardLinks = {
  trips: boolean;
  drivers: boolean;
  support: boolean;
  withdrawals: boolean;
  safety: boolean;
};

export function boardLinks(access: AdminAccess | null, cityCode: string): BoardLinks {
  return {
    trips: canOpenAt(access, 'trips', cityCode),
    drivers: canOpenAt(access, 'drivers', cityCode),
    support: canOpenAt(access, 'support', cityCode),
    withdrawals: canOpenAt(access, 'withdrawals', cityCode),
    safety: canOpenAt(access, 'safety', cityCode),
  };
}
