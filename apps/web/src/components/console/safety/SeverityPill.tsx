import { Alert, Clock, Shield, Siren } from '@/components/console/icons';
import { Pill, type PillTone } from '@/components/console/ui';
import { SEVERITY_LABEL, type Severity } from '@/lib/safety';

const ICON: Record<Severity, typeof Siren> = {
  critical: Siren, high: Alert, medium: Clock, low: Shield,
};

const TONE: Record<Severity, PillTone> = {
  critical: 'bad', high: 'wait', medium: 'neutral', low: 'neutral',
};

/**
 * Severity, carried by a word AND a shape. The colour only supports them:
 * four different glyphs mean an operator who cannot tell red from gold still
 * reads "Critical" with an alarm beside it.
 */
export function SeverityPill({ severity }: { severity: Severity }) {
  const Icon = ICON[severity] ?? Alert;
  return (
    <Pill tone={TONE[severity] ?? 'neutral'}>
      <Icon className="ops-pill__icon" />
      {SEVERITY_LABEL[severity] ?? severity}
    </Pill>
  );
}
