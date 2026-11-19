import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';

vi.mock('@/lib/api', async (orig) => {
  const real = await orig<typeof import('@/lib/api')>();
  return { ...real, api: { get: vi.fn() } };
});

import { api } from '@/lib/api';
import { Overview } from './Overview';

describe('Overview for a role without it (18 Nov)', () => {
  it('says the overview is not available to the role instead of showing an error', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(403, 'forbidden', 'You do not have permission to do that here.', true));
    render(<Overview access={null} />);
    expect(await screen.findByText('The overview is not available to your role')).toBeTruthy();
    expect(screen.queryByText('The overview could not be loaded')).toBeNull();
  });

  it('a failure names the next step once, not the title twice', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    render(<Overview access={null} />);
    expect(await screen.findByText('The overview could not be loaded')).toBeTruthy();
    expect(screen.getByText('Check your connection, then try again.')).toBeTruthy();
  });
});
