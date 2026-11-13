'use client';

import { useAdminAccess } from '@/lib/adminScope';
import { Overview } from '@/components/console/workspaces/Overview';

/**
 * The Overview route: Global, a country, a state or a city, by the operator's
 * place (design boards C and D). The page lives in `workspaces/Overview`.
 */
export default function DashboardPage() {
  const access = useAdminAccess();
  return <Overview access={access} />;
}
