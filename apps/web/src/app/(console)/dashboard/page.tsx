'use client';

import { CommandCentre } from '@/components/console/command-centre/CommandCentre';

/**
 * The Command Centre route. The page itself lives in
 * `components/console/command-centre` so it can be rendered in a test
 * without the App Router; this file only mounts it.
 */
export default function DashboardPage() {
  return <CommandCentre />;
}
