import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, api: { ...original.api, post: (...a: unknown[]) => post(...a) } };
});

import { endSearchSession, placeToPoint, searchPlaces } from './booking';

const tokenOf = (call: number) => (post.mock.calls[call][1] as { session_token: string }).session_token;

describe('places session token', () => {
  beforeEach(() => { post.mockReset(); post.mockResolvedValue({ location: { lat: 1, lng: 2 } }); endSearchSession('pickup'); });

  it('is shared by keystrokes and details, then renewed after a pick', async () => {
    await searchPlaces('ban');
    await searchPlaces('banj');
    await placeToPoint('p1');
    await searchPlaces('hit');
    expect(tokenOf(0)).toBeTruthy();
    expect(tokenOf(1)).toBe(tokenOf(0));
    expect(tokenOf(2)).toBe(tokenOf(0));
    expect(tokenOf(3)).not.toBe(tokenOf(0));
  });
});
