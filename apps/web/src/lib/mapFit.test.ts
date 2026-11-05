import { describe, expect, it } from 'vitest';
import { fitPadding } from './mapFit';
import { formatPlate, rideMeta } from './booking';

describe('fitPadding', () => {
  it('desktop: left padding is panel width + gutter + 32', () => {
    const p = fitPadding({ viewportWidth: 1280, panelWidth: 430, panelLeft: 56, sheetHeight: 0 });
    expect(p.left).toBe(430 + 56 + 32);
  });
  it('phone: bottom padding covers the sheet', () => {
    const p = fitPadding({ viewportWidth: 390, panelWidth: 390, panelLeft: 0, sheetHeight: 380 });
    expect(p.bottom).toBeGreaterThanOrEqual(380);
  });
});

describe('rideMeta', () => {
  const q = (eta: number | null, near: boolean) =>
    ({ estimated_fare: '100', pickup_eta_min: eta, drivers_nearby: near });
  it('shows ETA and seats', () => {
    expect(rideMeta('sedan', q(5, true))).toBe('5 min · 4 seats');
    expect(rideMeta('suv', q(7, true))).toBe('7 min · 6 seats');
  });
  it('says so when no drivers are nearby', () => {
    expect(rideMeta('auto', q(null, false))).toBe('No drivers nearby · 3 seats');
  });
  it('bike is one seat; unknown ETA with drivers shows seats only', () => {
    expect(rideMeta('bike', q(null, true))).toBe('1 seat');
    expect(rideMeta('hatchback', null)).toBe('4 seats');
  });
});

describe('formatPlate', () => {
  it('spaces a printed plate', () => {
    expect(formatPlate('TS09QT0059')).toBe('TS 09 QT 0059');
    expect(formatPlate('ts-09 qt 0059')).toBe('TS 09 QT 0059');
    expect(formatPlate('Unknown plate')).toBe('Unknown plate');
  });
});
