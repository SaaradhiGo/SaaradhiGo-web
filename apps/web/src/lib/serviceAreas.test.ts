import { describe, expect, it } from 'vitest';
import { primaryArea, type ServiceArea } from './serviceAreas';

const area = (code: string, centre = true): ServiceArea => ({
  zone: { code, name: code, country: 'IN', currency: 'INR' },
  centre: centre ? { lat: 1, lng: 1 } : null,
});

describe('primaryArea', () => {
  it('is the launch city, not the first zone by code', () => {
    // QA lists zones by code, so Vijayawada came first (2026-11-06).
    expect(primaryArea([area('IN-AP-VJA'), area('IN-TG-HYD')])?.zone.code).toBe('IN-TG-HYD');
  });
  it('falls back to the first zone with a centre', () => {
    expect(primaryArea([area('XX-1', false), area('XX-2')])?.zone.code).toBe('XX-2');
  });
});
