'use client';

import { DriverHead } from '@/components/area/DriverShell';
import { HelpContent } from '@/components/pages/HelpContent';
import { useTr } from '@/i18n/website';

/** Support: the Help page on the Driving topic, inside the driver area. */
export default function DriverSupportPage() {
  const tr = useTr();
  return (
    <>
      <DriverHead title={tr('Support')} />
      <div className="site"><HelpContent topic="driving" /></div>
    </>
  );
}
