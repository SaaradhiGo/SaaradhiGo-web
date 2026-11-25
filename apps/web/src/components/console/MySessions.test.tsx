/** 25 Nov (owner): My security lists my sessions and signs out the others. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MySessions } from './MySessions';
import { tokenId } from '@/lib/session/bff';

const SESSIONS = {
  sessions: [
    { id: 3, started_at: '2026-11-25T04:00:00Z', expires_at: '2026-12-09T04:00:00Z', current: true },
    { id: 2, started_at: '2026-11-20T04:00:00Z', expires_at: '2026-12-04T04:00:00Z', current: false },
  ], count: 2, this_session_known: true,
};

beforeEach(() => { document.cookie = 'sg-staff-in=1; path=/'; });
afterEach(() => cleanup());

describe('MySessions', () => {
  it('marks this browser and signs out the others', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true, status: 200,
      json: async () => ({ status: 'success', data: init?.method === 'POST' ? { sessions_ended: 1 } : SESSIONS }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<MySessions />);
    expect(await screen.findByText('This browser')).toBeTruthy();
    expect(screen.getByText(/2 sessions in all/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));
    expect(await screen.findByText('Signed out of 1 other session.')).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => JSON.stringify(c).includes('sign-out-others'))).toBe(true));
  });
});

describe('tokenId', () => {
  it('reads the jti of a token without trusting anything else', () => {
    const body = Buffer.from(JSON.stringify({ jti: 'abc123', user_id: 1 })).toString('base64url');
    expect(tokenId(`h.${body}.s`)).toBe('abc123');
    expect(tokenId('not-a-token')).toBeNull();
    const bad = Buffer.from(JSON.stringify({ jti: 'a b<script>' })).toString('base64url');
    expect(tokenId(`h.${bad}.s`)).toBeNull();
  });
});
