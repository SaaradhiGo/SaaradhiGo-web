import { Pause } from '@/components/console/icons';
import { Pill } from '@/components/console/ui';
import { type Sla, slaChip } from '@/lib/supportDesk';

/**
 * The SLA chip. A paused ticket (waiting on the user) carries an icon AND
 * the word "Paused", so the stopped clock never relies on colour alone.
 */
export function SlaChip({ sla }: { sla: Sla | null | undefined }) {
  const chip = slaChip(sla);
  const paused = sla?.state === 'paused';
  return (
    <Pill tone={chip.tone}>
      {paused ? <Pause className="ops-pill__icon" /> : null}
      <span title={paused ? 'Waiting on the user. The resolution clock is paused.' : undefined}>
        {chip.label}
      </span>
    </Pill>
  );
}
