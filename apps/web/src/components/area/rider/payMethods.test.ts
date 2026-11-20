import { describe, expect, it } from 'vitest';
import { payMethods } from './RideChoose';
import { consoleOnPublicHost } from '@/lib/session/adminHost';

describe('payment methods on the fare page (20 Nov)', () => {
  it('never offers cash in the US, and offers nothing with no live card provider', () => {
    expect(payMethods(undefined, [], true)).toEqual([]);
    expect(payMethods(undefined, null, true)).toEqual([]);
    expect(payMethods(undefined, ['cash'], true)).toEqual([]);
    expect(payMethods(['card', 'cash'], null, true)).toEqual(['card']);
  });

  it('keeps India as it was: the zone or server list, else cash', () => {
    expect(payMethods(undefined, ['cash'], false)).toEqual(['cash']);
    expect(payMethods(undefined, [], false)).toEqual(['cash']);
    expect(payMethods(['upi', 'cash'], null, false)).toEqual(['upi', 'cash']);
  });
});

describe('the console moves to admin.saaradhigo.com once it is live', () => {
  it('redirects www /ops paths only when switched on', () => {
    expect(consoleOnPublicHost('www.saaradhigo.com', '/ops/login', '?next=x', false)).toBeNull();
    expect(consoleOnPublicHost('www.saaradhigo.com', '/ops/login', '?next=x', true))
      .toEqual({ kind: 'redirect', to: 'https://admin.saaradhigo.com/ops/login?next=x' });
    expect(consoleOnPublicHost('www.saaradhigo.com', '/ops', '', true))
      .toEqual({ kind: 'redirect', to: 'https://admin.saaradhigo.com/ops' });
    expect(consoleOnPublicHost('www.saaradhigo.com', '/privacy', '', true)).toBeNull();
    expect(consoleOnPublicHost('admin.saaradhigo.com', '/ops', '', true)).toBeNull();
  });
});
