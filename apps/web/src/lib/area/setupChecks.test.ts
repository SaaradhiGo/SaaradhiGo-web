/**
 * Driver QA fixes (11 Nov): what each setup step's Save checks, one document state for every
 * screen, the step words, the saved number's spacing, setup addresses and three-letter months.
 */
import { describe, expect, it } from 'vitest';
import { month3 } from './format';
import type { Requirements } from './requirements';
import {
  addressProblem, contactProblems, dateProblem, documentRows, payoutProblem, readyToDrive, spacedPhone, stepWords, vehicleProblem,
} from './setupChecks';
import { resolveSlug } from './setupSlugs';

const blankAddress = { line1: '', city: '', state_code: '', postal_code: '' };

describe('each step checks before it moves on', () => {
  it('personal: a started address must be finished, with a 6-digit PIN in India', () => {
    expect(addressProblem(blankAddress, 'IN')).toBeNull();
    expect(addressProblem({ ...blankAddress, line1: '12 Road No. 3' }, 'IN')).toMatch(/Finish the address/);
    expect(addressProblem({ line1: '12 Road No. 3', city: 'Hyderabad', state_code: 'TG', postal_code: '5000' }, 'IN')).toMatch(/6-digit PIN/);
    expect(addressProblem({ line1: '12 Road No. 3', city: 'Hyderabad', state_code: 'TG', postal_code: '500034' }, 'IN')).toBeNull();
    expect(addressProblem({ line1: '1 Main St', city: 'Austin', state_code: 'TX', postal_code: '7870' }, 'US')).toMatch(/5-digit ZIP/);
  });

  it('contact: a 5-digit number or no relationship is caught; contact 2 only once typed in', () => {
    const [one, two] = contactProblems([
      { name: 'Lakshmi', relationship: '', phone_number: '+91 98765' },
      { name: '', relationship: '', phone_number: '+91' },
    ], 'IN', '+91');
    expect(one).toEqual({ relationship: 'Choose how you know them.', phone_number: 'Enter a 10-digit mobile number.' });
    expect(two).toEqual({});
    expect(contactProblems([{ name: 'Lakshmi', relationship: 'spouse', phone_number: '+91 98765 43210' }], 'IN', '+91')[0]).toEqual({});
    expect(contactProblems([{ name: 'Lakshmi', relationship: 'spouse', phone_number: '+91 12345 67890' }], 'IN', '+91')[0].phone_number)
      .toMatch(/starts with 6, 7, 8 or 9/);
    expect(contactProblems([{ name: 'Ana', relationship: 'spouse', phone_number: '+1 512 555 0142' }], 'US', '+1')[0]).toEqual({});
  });

  it('identity and papers: a date typed but not readable in the market order', () => {
    expect(dateProblem('', 'dmy')).toBeNull();
    expect(dateProblem('31/12', 'dmy')).toMatch(/dd\/mm\/yyyy/);
    expect(dateProblem('31/12/2030', 'dmy')).toBeNull();
    expect(dateProblem('31/12/2030', 'mdy')).toMatch(/mm\/dd\/yyyy/);
  });

  it('vehicle: a started vehicle must be finished', () => {
    const none = { type: 'sedan', make: '', modelId: '', year: '', colour: '', plate: '' };
    expect(vehicleProblem(none, false)).toBeNull();
    expect(vehicleProblem({ ...none, make: 'Maruti Suzuki' }, false)).toBe('Choose the make, model, year, colour and number plate.');
    expect(vehicleProblem({ type: 'sedan', make: 'Maruti Suzuki', modelId: '11', year: '2024', colour: 'White', plate: 'TS09AB1234' }, true)).toBeNull();
  });

  it('payouts: started bank details must be complete and match', () => {
    const b = { method: 'bank' as const, holder: '', number: '', confirm: '', code: '', upi: '' };
    expect(payoutProblem(b)).toBeNull();
    expect(payoutProblem({ ...b, holder: 'Ravi Teja', code: 'HDFC0001234', number: '1234567890', confirm: '1234567891' })).toMatch(/do not match/);
    expect(payoutProblem({ ...b, holder: 'Ravi Teja', code: 'HDFC1234', number: '1234567890', confirm: '1234567890' })).toMatch(/IFSC/);
    expect(payoutProblem({ ...b, method: 'upi', upi: 'ravi' })).toMatch(/UPI ID/);
  });
});

const req = (items: Record<string, unknown>[], approved = true, blocking: string[] = []) => ({
  checklist: { items, approved, blocking, steps: [], market: { country: 'IN', state: '' }, done: 0, total: 0 },
}) as unknown as Requirements;
const file = (key: string, status: string, vehicle = false) => ({ key, label: key, status, reason: null, uploaded_at: '2026-11-11T08:00:00Z', vehicle });

describe('one state for every screen', () => {
  it('a paper whose file is approved but whose date is missing or passed is not approved', () => {
    const rows = documentRows(req([
      { key: 'fitness', need: 'required', status: 'missing', reason: 'Add the expiry date shown on the document.', expires: null, files: [file('fitness', 'approved', true)] },
      { key: 'insurance', need: 'required', status: 'expiring', reason: null, expires: '2026-11-30', files: [file('insurance', 'approved', true)] },
      { key: 'vehicle_photos', need: 'required', status: 'missing', reason: null, expires: null,
        files: ['front', 'back', 'left', 'right', 'interior'].map((s) => file(`vehicle_photo_${s}`, s === 'front' ? 'approved' : 'missing', true)) },
      { key: 'profile_photo', need: 'required', status: 'approved', reason: null, expires: null, files: [file('profile_photo', 'approved')] },
      { key: 'permanent_address', need: 'optional', status: 'missing', reason: null, expires: null, files: [] },
    ]));
    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ['fitness', 'missing'], ['insurance', 'expiring'], ['vehicle_photo_front', 'approved'], ['vehicle_photo_back', 'missing'],
      ['vehicle_photo_left', 'missing'], ['vehicle_photo_right', 'missing'], ['vehicle_photo_interior', 'missing'], ['profile_photo', 'approved'],
    ]);
    expect(rows[0].reason).toMatch(/expiry date/);
    expect(rows[1].expires).toBe('2026-11-30');
    expect(rows.find((r) => r.key === 'profile_photo')?.target).toBe('personal');
  });

  it('"approved to drive" only when nothing blocks; a done contact is "Added"', () => {
    expect(readyToDrive(req([], true, []))).toBe(true);
    expect(readyToDrive(req([], true, ['aadhaar']))).toBe(false);
    expect(readyToDrive(req([], false, []))).toBe(false);
    expect(stepWords('done', 'contact')).toBe('Added');
    expect(stepWords('done', 'identity')).toBe('Done');
  });
});

describe('small things', () => {
  it('a saved number reads with spaces', () => {
    expect(spacedPhone('+919876543210')).toBe('+91 98765 43210');
    expect(spacedPhone('+15125550142')).toBe('+1 512 555 0142');
  });

  it('an older or unknown setup address opens its step or the setup start', () => {
    expect(resolveSlug('identity')).toEqual({ slug: 'identity' });
    expect(resolveSlug('licence')).toEqual({ redirect: '/driver/setup/identity' });
    expect(resolveSlug('nonsense')).toEqual({ redirect: '/driver/setup' });
  });

  it('short months are three letters', () => {
    expect(month3('Sept')).toBe('Sep');
    expect(month3('Wed, 16 Sept 2026')).toBe('Wed, 16 Sep 2026');
    expect(month3('Nov')).toBe('Nov');
  });
});
