import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

describe('/driver/documents/upload', () => {
  it('sends a signed-in driver to the upload form, never to a "rider account" message', async () => {
    const { default: Page } = await import('./page');
    Page();
    expect(redirect).toHaveBeenCalledWith('/driver/documents');
  });
});
