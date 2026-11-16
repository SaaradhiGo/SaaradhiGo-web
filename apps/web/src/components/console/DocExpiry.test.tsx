/** 13 Nov: document expiry as dd/mm/yyyy, amber within 30 days; city settings in the zone change body. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { changeBody, draftFromZone, type Zone } from '@/lib/zones';
import { DocExpiry } from './DocExpiry';

afterEach(cleanup);

describe('document expiry', () => {
  it('reads dd/mm/yyyy and turns amber within 30 days', () => {
    render(<DocExpiry iso="2026-11-30" today="2026-11-13" />);
    const el = screen.getByTestId('doc-expiry');
    expect(el.textContent).toMatch(/Expires 30\/11\/2026/);
    expect(el.textContent).toMatch(/expires in 17 days/);
  });
  it('stays plain further out', () => {
    render(<DocExpiry iso="2028-10-31" today="2026-11-13" />);
    expect(screen.getByTestId('doc-expiry').textContent).toBe('Expires 31/10/2028');
  });
});

describe('zone city settings', () => {
  it('sends the low-rating line and the review target, blank as null', () => {
    const zone = { name: 'Hyderabad', zone_type: 'city', priority: 10, state_code: 'TG', city: 'Hyderabad', currency: 'INR',
      timezone_name: 'Asia/Kolkata', distance_unit: 'km', tax_mode: 'inclusive', per_trip_fee: '0', per_trip_fee_label: '',
      polygon_geojson: null, low_rating_below: '4.50', low_rating_min_ratings: 10 } as unknown as Zone;
    const draft = { ...draftFromZone(zone), low_rating_below: '4', low_rating_min_ratings: '', kyc_review_target_days: '2' };
    const body = changeBody(zone, draft, 'per-city line');
    expect(body).toMatchObject({ low_rating_below: 4, low_rating_min_ratings: null, kyc_review_target_days: 2 });
  });
});
