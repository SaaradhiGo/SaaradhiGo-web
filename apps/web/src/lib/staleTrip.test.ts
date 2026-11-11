import { describe, expect, it } from 'vitest';
import {
  type ReleasePreview, type StaleActions, consequence, failureText, outcomeText, panelModel,
  previewRows, reasonProblem, releaseReady, silentFor, staleReasonText,
} from './staleTrip';

const CODES = [
  { code: 'driver_unresponsive', label: 'Driver unresponsive', rule: 'standard' as const },
  { code: 'safety_incident', label: 'Safety incident', rule: 'platform_funded' as const },
];

const base: StaleActions = {
  can_resolve: true, is_stale: true, mark_reviewed: true, release_driver: true, release_case: 'B',
  reason_codes: [], reason_min_length: 5, reason_max_length: 500,
};
const stale = { is_stale: true, reason: 'driver_silent_long' };

describe('panelModel', () => {
  it('offers both buttons for a ghost trip before pickup', () => {
    const m = panelModel(stale, base);
    expect(m.show).toBe(true);
    expect(m.buttons).toEqual(['mark_reviewed', 'release_driver']);
  });

  it('offers review and the release for a started trip (case C)', () => {
    const m = panelModel(stale, { ...base, release_case: 'C', reason_codes: CODES });
    expect(m.buttons).toEqual(['mark_reviewed', 'release_driver']);
    expect(m.readOnly).toBe(false);
  });

  it('draws nothing for a trip that is not stale', () => {
    expect(panelModel({ is_stale: false, reason: null }, { ...base, mark_reviewed: false, release_driver: false, release_case: null }).show).toBe(false);
  });

  it('draws nothing when the server sent no stale answer (older backend)', () => {
    expect(panelModel(stale, undefined).show).toBe(false);
    expect(panelModel(undefined, undefined).show).toBe(false);
  });

  it('shows a read-only note, with no buttons, to a role without the capability', () => {
    const m = panelModel(stale, { ...base, can_resolve: false, mark_reviewed: false, release_driver: false, release_case: null });
    expect(m.show).toBe(true);
    expect(m.buttons).toEqual([]);
    expect(m.readOnly).toBe(true);
  });

  it('offers the repair for a finished trip whose driver is still marked busy, though it is not stale', () => {
    const m = panelModel({ is_stale: false, reason: null }, { ...base, is_stale: false, mark_reviewed: false, release_case: 'A' });
    expect(m.show).toBe(true);
    expect(m.buttons).toEqual(['release_driver']);
  });
});

describe('reasonProblem', () => {
  it('requires a reason of 5 to 500 characters after trimming', () => {
    expect(reasonProblem('')).toBe('A reason is required.');
    expect(reasonProblem('    ')).toBe('A reason is required.');
    expect(reasonProblem('abcd')).toBe('Write at least 5 characters.');
    expect(reasonProblem('  abcd  ')).toBe('Write at least 5 characters.');
    expect(reasonProblem('abcde')).toBeNull();
    expect(reasonProblem('x'.repeat(500))).toBeNull();
    expect(reasonProblem('x'.repeat(501))).toMatch(/500 characters or fewer/);
  });
});

describe('silentFor', () => {
  it('speaks in minutes, then hours, then days', () => {
    expect(silentFor(20)).toBe('less than a minute');
    expect(silentFor(60)).toBe('1 minute');
    expect(silentFor(30 * 60)).toBe('30 minutes');
    expect(silentFor(3600)).toBe('1 hour');
    expect(silentFor(3600 + 5 * 60)).toBe('1 hour 5 minutes');
    expect(silentFor(26 * 3600)).toBe('1 day 2 hours');
  });
  it('never invents a number', () => {
    expect(silentFor(null)).toBe('unknown');
    expect(silentFor(undefined)).toBe('unknown');
    expect(silentFor(-5)).toBe('unknown');
    expect(silentFor(Number.NaN)).toBe('unknown');
  });
});

describe('what the dialog says', () => {
  it('reads back the no-charge, no-fee consequence for a ghost trip', () => {
    expect(consequence('release_driver', 'B')).toBe(
      'The trip will be cancelled with no charge to the rider and no fee to the driver, and the driver can take trips again.');
  });
  it('says a repair leaves the trip alone', () => {
    expect(consequence('release_driver', 'A')).toMatch(/not changed/);
    expect(consequence('mark_reviewed', null)).toMatch(/not changed/);
  });
  it('reports each outcome plainly', () => {
    expect(outcomeText('mark_reviewed', { trip_id: 1, outcome: 'marked_reviewed' })).toBe('Marked reviewed. The trip is unchanged.');
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'cancelled_and_released', case: 'B' })).toMatch(/no charge to the rider/);
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'repaired_cleared', case: 'A' })).toMatch(/can take trips again/);
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'repaired_set', case: 'A' })).toMatch(/not released/);
  });
  it('names the stale reasons in words', () => {
    expect(staleReasonText('driver_silent')).toBe('The driver has gone quiet');
    expect(staleReasonText('something_new')).toBe('something new');
    expect(staleReasonText(null)).toBe('This trip has stopped progressing');
  });
});

const preview: ReleasePreview = {
  reason_code: 'driver_unresponsive', rule: 'standard', currency: 'INR', payment_method: 'online',
  distance_km: '2.00', distance_source: 'trail', elapsed_minutes: '3.00',
  uncapped_fare_minor: 4900, upfront_price_minor: 5300, capped_fare_minor: 4900, cap_applied: false,
  rider_pays_minor: 4900, commission_percent: '20.00', commission_minor: 980,
  driver_earnings_minor: 3920, funded_by: 'rider', driver_collects_cash: false,
};

describe('the started-trip release', () => {
  it('states each rule plainly, and asks for a reason before any code is chosen', () => {
    expect(consequence('release_driver', 'C', null)).toMatch(/Choose why/);
    expect(consequence('release_driver', 'C', 'standard')).toMatch(/never more than the upfront price/);
    expect(consequence('release_driver', 'C', 'platform_funded')).toMatch(/rider is not charged/);
    expect(consequence('release_driver', 'C', 'platform_funded')).toMatch(/SaaradhiGo pays the driver/);
  });

  it('will not send a started-trip release without a reason code', () => {
    expect(releaseReady('C', null, 'Driver gone for an hour')).toBe(false);
    expect(releaseReady('C', 'other', 'abc')).toBe(false);
    expect(releaseReady('C', 'other', 'Driver gone for an hour')).toBe(true);
    // A pre-pickup release needs no code.
    expect(releaseReady('B', null, 'Driver gone for an hour')).toBe(true);
  });

  it("lays out the server's figures with the money helper, not its own arithmetic", () => {
    const rows = previewRows(preview);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Distance driven']).toBe('2.00 km (from the recorded trail)');
    expect(byLabel['Time charged']).toMatch(/^3\.00 min/);
    expect(byLabel['Rider pays']).toBe('₹49.00');
    expect(byLabel['Driver earns']).toBe('₹39.20 after 20.00% commission');
    expect(byLabel['Paid by']).toBe('The rider');
  });

  it('shows the cap when it applied', () => {
    const rows = previewRows({ ...preview, cap_applied: true, uncapped_fare_minor: 25000, capped_fare_minor: 5300, rider_pays_minor: 5300 });
    expect(rows.find((r) => r.label === 'Fare for the distance driven')?.value).toBe('₹53.00 (capped from ₹250.00)');
  });

  it('says "Not charged" and who funds it on the platform rule', () => {
    const rows = previewRows({ ...preview, rule: 'platform_funded', rider_pays_minor: 0, funded_by: 'platform' });
    expect(rows.find((r) => r.label === 'Rider pays')?.value).toBe('Not charged');
    expect(rows.find((r) => r.label === 'Paid by')?.value).toBe('SaaradhiGo (platform-funded)');
  });

  it('shows a promo honoured on the capped fare, and what the rider then pays', () => {
    const rows = previewRows({ ...preview, promo_discount_minor: 2000, rider_pays_after_promo_minor: 2900 });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Promo discount']).toBe('₹20.00 (paid by SaaradhiGo)');
    expect(byLabel['Rider pays']).toBe('₹29.00');
    expect(byLabel['Driver earns']).toBe('₹39.20 after 20.00% commission');   // still on the full capped fare
  });

  it('says "Not charged" when a promo covers the whole capped fare', () => {
    const rows = previewRows({ ...preview, promo_discount_minor: 4900, rider_pays_after_promo_minor: 0 });
    expect(rows.find((r) => r.label === 'Rider pays')?.value).toBe('Not charged');
  });

  it('shows no promo row on the platform rule (the reservation is released)', () => {
    const rows = previewRows({ ...preview, rule: 'platform_funded', rider_pays_minor: 0, funded_by: 'platform',
      promo_discount_minor: 0, rider_pays_after_promo_minor: 0 });
    expect(rows.find((r) => r.label === 'Promo discount')).toBeUndefined();
  });

  it('lays out the US tax on the amount charged, as the server worked it out', () => {
    const rows = previewRows({
      ...preview, currency: 'USD', capped_fare_minor: 1305, rider_pays_minor: 1305,
      pretax_fare_minor: 1050, tax_minor: 105, per_trip_fee_minor: 150,
      tax_note: 'US accountant to confirm (go-live blocker #15)',
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Fare before tax']).toBe('$10.50');
    expect(byLabel['Tax on the amount charged']).toBe('$1.05');
    expect(byLabel['Per-trip fee']).toBe('$1.50');
    expect(byLabel['Rider pays']).toBe('$13.05');
    expect(byLabel['Note']).toMatch(/blocker #15/);
  });

  it('says no tax or fee is charged when the rider pays 0, and names the platform expense', () => {
    const rows = previewRows({
      ...preview, currency: 'USD', rule: 'platform_funded', rider_pays_minor: 0, funded_by: 'platform',
      pretax_fare_minor: 0, tax_minor: 0, per_trip_fee_minor: 0, regulatory_fee_expense_minor: 150,
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['Tax and fee']).toBe('None charged to the rider');
    expect(byLabel['Regulatory fee']).toBe('$1.50 booked as a SaaradhiGo expense');
    expect(byLabel['Tax on the amount charged']).toBeUndefined();
  });

  it('shows no tax rows at all for India (inclusive tax) or an older backend', () => {
    const labels = (p: Parameters<typeof previewRows>[0]) => previewRows(p).map((r) => r.label);
    for (const extra of [{}, { pretax_fare_minor: null, tax_minor: null, per_trip_fee_minor: null }]) {
      const l = labels({ ...preview, ...extra });
      expect(l).not.toContain('Tax on the amount charged');
      expect(l).not.toContain('Fare before tax');
      expect(l).not.toContain('Tax and fee');
    }
  });

  it('uses the preview currency, never a hard-coded symbol', () => {
    const rows = previewRows({ ...preview, currency: 'USD' });
    expect(rows.find((r) => r.label === 'Rider pays')?.value).toBe('$49.00');
  });

  it('says there is no trail when none was recorded, and how cash is handled', () => {
    const rows = previewRows({ ...preview, distance_km: '0.00', distance_source: 'none', payment_method: 'cash', driver_collects_cash: true });
    expect(rows[0].value).toBe('0.00 km (no trail recorded, counted as 0)');
    expect(rows.find((r) => r.label === 'Cash trip')?.value).toMatch(/owes the commission/);
  });

  it('reports the started-trip outcome by rule', () => {
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'ended_by_operator', case: 'C', rule: 'standard' })).toMatch(/pays the fare for the distance driven/);
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'ended_by_operator', case: 'C', rule: 'platform_funded' })).toMatch(/rider was not charged/);
  });
});

describe('failureText', () => {
  it('keeps a server refusal and its code so it can be shown as text', () => {
    expect(failureText({ fromServer: true, code: 'trip_active', message: 'This trip is not stale.' })).toEqual({
      code: 'trip_active', message: 'This trip is not stale.',
    });
  });
  it('does not show a transport error as if the server said it', () => {
    expect(failureText(new Error('HTTP 502'))).toEqual({ code: null, message: 'That did not go through. Nothing was changed.' });
    expect(failureText(null).code).toBeNull();
  });
});
