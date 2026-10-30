import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Sla } from '@/lib/supportDesk';
import { SlaChip } from './SlaChip';

const clock = { due_at: null, done_at: null, breached: false, minutes_remaining: null };
const sla = (patch: Partial<Sla>): Sla => ({
  state: 'ok', next: 'resolution', minutes_remaining: 120, breached: false,
  first_response: clock, resolution: clock, ...patch,
});

describe('SlaChip', () => {
  it('draws an icon beside the word Paused for a ticket waiting on the user', () => {
    const { container } = render(<SlaChip sla={sla({ state: 'paused', paused: true })} />);
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(container.querySelector('svg.ops-pill__icon')).not.toBeNull();
  });

  it('draws no icon for a running clock', () => {
    const { container } = render(<SlaChip sla={sla({})} />);
    expect(screen.getByText('2h left')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
  });
});
