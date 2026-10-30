/**
 * The safety components: severity is a word AND a shape, and the incident
 * action drawer sends exactly what the server asks for and refuses what the
 * server would refuse.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncidentDetail } from '@/lib/safety';
import { IncidentActionDrawer } from './IncidentActionDrawer';
import { SeverityPill } from './SeverityPill';

function respond(status: number, data: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(status < 300 ? { data } : { error: data }), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

function call(fetchMock: ReturnType<typeof respond>, n = 0) {
  const [url, init] = fetchMock.mock.calls[n] as unknown as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : null };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const incident = (patch: Partial<IncidentDetail> = {}): IncidentDetail => ({
  id: 9, title: 'SOS (panic) on trip 4', category: 'other', severity: 'critical', status: 'open',
  source: 'sos', country: 'IN', anchor: { source: 'trip', node: 'IN-TG-HYD', node_name: 'Hyderabad' },
  trip_id: 4, assigned_to: null, assignee: null, opened_at: '2026-10-30T10:00:00Z', closed_at: null,
  outcome: null, police_referred_at: null, escalated: false,
  sos: { active: 0, unacknowledged: 0, oldest_unacknowledged_at: null, oldest_active_at: null },
  closing_summary: null, police_reference: null, timeline: [],
  people: {
    drivers: [{ id: 3, driver_name: 'Suresh R.', in_scope: true, suspended: false, can_suspend: true, page: { type: 'driver', id: 3 } }],
    riders: [{ id: 5, rider_name: 'Ravi K.', in_scope: true, blocked: false, can_block: true, page: { type: 'rider', id: 5 } }],
    trips: [], tickets: [],
  },
  sos_events: [], signals: [],
  emergency: { country: 'IN', configured: true, numbers: [{ label: 'unified', number: '112' }] },
  actions: {
    assign: true, note: true, status: true, link: true, unlink: true, refer_police: true, close: true,
    close_blockers: [], suspend_driver: true, block_rider: true, reveal_sos: false, edit_config: false,
  },
  vocabulary: {
    categories: ['other'], severities: ['critical'], statuses: ['open'],
    outcomes: ['no_action', 'warning', 'police_referral'],
  },
  ...patch,
});

describe('SeverityPill', () => {
  it('carries the word and an icon, for every severity', () => {
    for (const [severity, word] of [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] as const) {
      const { container, unmount } = render(<SeverityPill severity={severity} />);
      expect(screen.getByText(word)).toBeTruthy();
      expect(container.querySelector('svg')).not.toBeNull();
      unmount();
    }
  });
});

describe('IncidentActionDrawer', () => {
  it('close needs a summary and an outcome before it will send, and sends both', async () => {
    const fetchMock = respond(200, { changed: true });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<IncidentActionDrawer action="close" incident={incident()} onClose={vi.fn()} onDone={onDone} />);
    const button = screen.getByRole('button', { name: 'Close incident' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Closing summary (required)'), { target: { value: 'Rider safe, driver warned' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Outcome (required)'), { target: { value: 'warning' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('The incident is closed.'));
    const sent = call(fetchMock);
    expect(sent.url).toMatch(/\/safety\/admin\/incidents\/9\/close\/$/);
    expect(sent.body).toEqual({ summary: 'Rider safe, driver warned', outcome: 'warning' });
  });

  it('cannot close while a live SOS blocks it, and says why', () => {
    render(<IncidentActionDrawer
      action="close"
      incident={incident({ actions: { ...incident().actions, close: false, close_blockers: [
        { code: 'SOS_STILL_ACTIVE', message: 'Resolve or mark false alarm every linked SOS first.', sos_ids: [1] },
      ] } })}
      onClose={vi.fn()} onDone={vi.fn()}
    />);
    expect(screen.getByText(/Resolve or mark false alarm every linked SOS first/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Close incident' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('suspend sends the linked driver and a reason code, and reads the consequence first', async () => {
    const fetchMock = respond(201, { created: true });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<IncidentActionDrawer action="suspend" incident={incident()} onClose={vi.fn()} onDone={onDone} />);
    expect(screen.getByText(/changes no fare and no earnings/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Safety concern'));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend driver' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(call(fetchMock).body).toEqual({ driver_id: 3, reason_code: 'safety', note: '' });
  });

  it('block "other" needs a note', () => {
    render(<IncidentActionDrawer action="block" incident={incident()} onClose={vi.fn()} onDone={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Block rider' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Other (note required)'));
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Note (required)'), { target: { value: 'Threatened the driver' } });
    expect(button.disabled).toBe(false);
  });

  it('refer to police shows the country\'s numbers and records the call', async () => {
    const fetchMock = respond(200, { changed: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<IncidentActionDrawer action="police" incident={incident()} onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByText('112')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reference (optional)'), { target: { value: 'FIR-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as referred to police' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(call(fetchMock).url).toMatch(/refer-police\/$/);
    expect(call(fetchMock).body).toEqual({ reference: 'FIR-7', note: '' });
  });

  it('a country with no numbers says so and shows none', () => {
    render(<IncidentActionDrawer
      action="police"
      incident={incident({ emergency: { country: 'US', configured: false, numbers: [] } })}
      onClose={vi.fn()} onDone={vi.fn()}
    />);
    expect(screen.getByText(/Not configured for US/)).toBeTruthy();
    expect(screen.queryByText('112')).toBeNull();
  });

  it('shows the server\'s own refusal and does not report success', async () => {
    vi.stubGlobal('fetch', respond(409, { code: 'INCIDENT_CLOSED', message: 'This incident is closed.' }));
    const onDone = vi.fn();
    render(<IncidentActionDrawer action="note" incident={incident()} onClose={vi.fn()} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Note (required)'), { target: { value: 'late note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
