// Launch round 3, item 2: a drop just outside the service area names the area,
// never "We could not load fares".
import { describe, expect, it } from 'vitest';
import { outsideAreaLine } from './RideChoose';

const en = (s: string) => s;

describe('outside the service area', () => {
  it('names the area the server gives', () => {
    expect(outsideAreaLine('This place is outside our service area (Treasure Valley).', en))
      .toBe('This place is outside our service area (Treasure Valley).');
  });
  it('reads without a name', () => {
    expect(outsideAreaLine('Pickup or drop is outside our service area.', en))
      .toBe('This place is outside our service area.');
  });
  it('keeps the area name in a translated line', () => {
    const hi = (s: string) => (s === 'This place is outside our service area' ? 'यह जगह हमारे सेवा क्षेत्र से बाहर है' : s);
    expect(outsideAreaLine('This place is outside our service area (Hyderabad).', hi))
      .toBe('यह जगह हमारे सेवा क्षेत्र से बाहर है (Hyderabad).');
  });
});
