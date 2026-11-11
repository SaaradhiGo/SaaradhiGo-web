/**
 * The template editor: the live preview, the variable problems, and the India SMS refusal.
 * The server is the authority; these prove the editor says the same thing while typing and
 * shows the server's own refusal, verbatim, when a submit is refused.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminAccess } from '@/lib/adminScope';
import { TemplateEditor } from './TemplateEditor';

let current: AdminAccess | null = null;
vi.mock('@/lib/adminScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adminScope')>();
  return { ...original, useAdminAccess: () => current };
});

const ACCESS = {
  id: 1, email: 'm@x.test', full_name: 'M', is_superuser: false, is_break_glass: false,
  permissions: ['notify.read', 'notify.template'], roles: [], scopes: [], access_model: 'assignments',
  super_admin_shortfall: 0,
} as unknown as AdminAccess;

type Handler = (url: string, init: RequestInit) => { status: number; data: unknown };

function stubFetch(handler: Handler) {
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    const { status, data } = handler(url, init);
    return new Response(JSON.stringify(status < 300 ? { data } : { error: data }), {
      status, headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const PREVIEW = { values: {}, problems: [], body: '', subject: '', title: '', missing: [], registration_problems: [] };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); current = null; });

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('TemplateEditor (new template)', () => {
  it('previews the body with sample values as they are typed', () => {
    current = ACCESS;
    stubFetch(() => ({ status: 200, data: PREVIEW }));
    render(<TemplateEditor templateId={null} defaultCountry="IN" onClose={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />);
    type('Body (English)', 'Hi {name}, your fare is {fare}.');
    fireEvent.click(screen.getByRole('button', { name: 'Detect from text' }));
    expect((screen.getByLabelText('Variables') as HTMLInputElement).value).toBe('name, fare');
    type('name', 'Asha');
    expect(screen.getByText('Hi Asha, your fare is {fare}.')).toBeTruthy();
    expect(screen.getByText('No sample value yet for: fare.')).toBeTruthy();
    type('fare', '120');
    expect(screen.getByText('Hi Asha, your fare is 120.')).toBeTruthy();
  });

  it('names an undeclared variable and a variable that is never used', () => {
    current = ACCESS;
    stubFetch(() => ({ status: 200, data: PREVIEW }));
    render(<TemplateEditor templateId={null} defaultCountry="IN" onClose={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />);
    type('Body (English)', 'Hi {name}');
    type('Variables', 'city');
    const problems = screen.getByRole('list', { name: 'Problems with the copy' });
    expect(problems.textContent).toContain('The body uses undeclared variables: name.');
    expect(problems.textContent).toContain('Declared but never used: city.');
  });

  it('shows the DLT refusal for an India SMS without its registration, and clears it when complete', () => {
    current = ACCESS;
    stubFetch(() => ({ status: 200, data: PREVIEW }));
    render(<TemplateEditor templateId={null} defaultCountry="IN" onClose={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'sms' } });
    type('Body (English)', 'SaaradhiGo: pay {amount}.');
    type('Variables', 'amount');
    const refusal = screen.getByLabelText('Why this cannot be activated yet');
    expect(refusal.textContent).toContain('cannot be activated without its DLT template ID and sender ID and msg91 flow ID');
    type('DLT template ID', 'DLT-1');
    type('Sender ID', 'SGOTST');
    type('MSG91 flow ID', 'flow-1');
    expect(screen.getByLabelText('Why this cannot be activated yet').textContent).toContain('No DLT-approved text');
    fireEvent.click(screen.getByRole('button', { name: 'Fill from the body' }));
    expect(screen.queryByLabelText('Why this cannot be activated yet')).toBeNull();
  });

  it('a US SMS asks for no registration at all', () => {
    current = ACCESS;
    stubFetch(() => ({ status: 200, data: PREVIEW }));
    render(<TemplateEditor templateId={null} defaultCountry="US" onClose={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'sms' } });
    expect(screen.queryByLabelText('India SMS registration')).toBeNull();
    expect(screen.queryByLabelText('Why this cannot be activated yet')).toBeNull();
  });

  it('shows the server refusal verbatim when a submit is refused, and sends nothing as approved', async () => {
    current = ACCESS;
    const refusal = 'An India SMS template cannot be activated without its DLT template ID registered for msg91.';
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith('/templates/preview/')) return { status: 200, data: PREVIEW };
      if (url.endsWith('/templates/') && init.method === 'POST') return { status: 201, data: { id: 9 } };
      if (url.endsWith('/templates/9/registrations/')) return { status: 200, data: {} };
      return { status: 422, data: { code: 'DLT_REGISTRATION_REQUIRED', message: refusal, field: 'registrations' } };
    });
    const onDone = vi.fn();
    render(<TemplateEditor templateId={null} defaultCountry="IN" onClose={vi.fn()} onDone={onDone} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'sms' } });
    type('Key', 'ride.test');
    type('Body (English)', 'SaaradhiGo: pay {amount}.');
    type('Variables', 'amount');
    type('Why (kept in the audit log)', 'Go live for the pilot');
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(refusal));
    expect(onDone).not.toHaveBeenCalled();
    const submitted = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/templates/9/submit/'));
    expect(submitted).toBeTruthy();
  });

  it('reports a successful submit as sent for approval', async () => {
    current = ACCESS;
    stubFetch((url, init) => {
      if (url.endsWith('/templates/preview/')) return { status: 200, data: PREVIEW };
      if (url.endsWith('/templates/') && init.method === 'POST') return { status: 201, data: { id: 4 } };
      return { status: 202, data: { state: 'pending_approval', approval_request: { id: 55, status: 'requested' } } };
    });
    const onDone = vi.fn();
    render(<TemplateEditor templateId={null} defaultCountry="IN" onClose={vi.fn()} onDone={onDone} onOpen={vi.fn()} />);
    type('Key', 'ride.mail');
    type('Subject', 'Hello');
    type('Body (English)', 'Plain text.');
    type('Why (kept in the audit log)', 'Welcome email copy');
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toEqual({ text: 'Sent for approval · request #55', kind: 'pending' });
  });

  it('draws no editing controls for a role that cannot draft', () => {
    current = { ...ACCESS, permissions: ['notify.read'] } as AdminAccess;
    stubFetch(() => ({ status: 200, data: PREVIEW }));
    render(<TemplateEditor templateId={null} defaultCountry="IN" onClose={vi.fn()} onDone={vi.fn()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  });
});
