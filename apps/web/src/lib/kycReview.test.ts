import { describe, expect, it } from 'vitest';
import {
  type ReviewDoc, allApproved, docState, expiryCheck, expiryFor, firstUndecided, kycKeyAction, localToday,
  looksLikePdf, nextUndecided, nothingLeft, otherSide, paceFrom, reasonReady, reuploadReason, shortDuration,
  stepIndex,
} from './kycReview';

const doc = (key: string, review_state: string, patch: Partial<ReviewDoc> = {}): ReviewDoc => ({
  key, label: key, owner: 'driver', vehicle_id: null, present: review_state !== 'missing', recordable: true,
  viewable: true, url_withheld: false, review_state, review: null, ...patch,
});

describe('next document', () => {
  const docs = [doc('license_front', 'approved'), doc('license_back', 'not_reviewed'), doc('rc', 'missing', { owner: 'vehicle', vehicle_id: 4 }), doc('insurance', 'not_reviewed', { owner: 'vehicle', vehicle_id: 4 })];

  it('skips decided and missing documents and wraps round', () => {
    expect(nextUndecided(docs, 1)).toBe(3);
    expect(nextUndecided(docs, 3)).toBe(1);
    expect(firstUndecided(docs)).toBe(1);
  });

  it('says when nothing is left and whether everything is approved', () => {
    const decided = [doc('a', 'approved'), doc('b', 'rejected')];
    expect(nextUndecided(decided, 0)).toBe(-1);
    expect(nothingLeft(decided)).toBe(true);
    expect(allApproved(decided)).toBe(false);
    expect(allApproved([doc('a', 'approved')])).toBe(true);
    expect(allApproved([])).toBe(false);
    expect(firstUndecided(decided)).toBe(0);
  });

  it('steps J and K without running off either end', () => {
    expect(stepIndex(4, 3, 1)).toBe(3);
    expect(stepIndex(4, 0, -1)).toBe(0);
    expect(stepIndex(4, 1, 1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(-1);
  });

  it('finds the other side of the licence only when it is on file', () => {
    expect(otherSide(docs, 0)).toBe(1);
    expect(otherSide(docs, 1)).toBe(0);
    expect(otherSide(docs, 3)).toBe(-1);
    expect(otherSide([doc('license_front', 'not_reviewed'), doc('license_back', 'missing')], 0)).toBe(-1);
  });

  it('labels states in words, red only for rejected', () => {
    expect(docState(doc('a', 'rejected'))).toEqual(['Rejected', 'critical']);
    expect(docState(doc('a', 'not_reviewed'))).toEqual(['Pending', 'neutral']);
    expect(docState(doc('a', 'approved'))).toEqual(['Approved', 'good']);
    expect(docState(doc('a', 'missing', { recordable: false }))[1]).toBe('neutral');
  });
});

describe('keyboard', () => {
  it('maps the five keys, either case', () => {
    expect(kycKeyAction({ key: 'a' })).toBe('approve');
    expect(kycKeyAction({ key: 'R' })).toBe('reject');
    expect(kycKeyAction({ key: 'u' })).toBe('reupload');
    expect(kycKeyAction({ key: 'j' })).toBe('next');
    expect(kycKeyAction({ key: 'k' })).toBe('prev');
    expect(kycKeyAction({ key: 'x' })).toBeNull();
  });

  it('does nothing while typing or with a modifier', () => {
    expect(kycKeyAction({ key: 'a', target: { tagName: 'TEXTAREA' } })).toBeNull();
    expect(kycKeyAction({ key: 'a', target: { tagName: 'input' } })).toBeNull();
    expect(kycKeyAction({ key: 'a', target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
    expect(kycKeyAction({ key: 'r', ctrlKey: true })).toBeNull();
    expect(kycKeyAction({ key: 'a', target: { tagName: 'BUTTON' } })).toBe('approve');
  });
});

describe('reasons', () => {
  it('prefixes a re-upload once', () => {
    expect(reuploadReason(' The photo is blurry. ')).toBe('Please upload again: The photo is blurry.');
    expect(reuploadReason('Please upload again: cut off')).toBe('Please upload again: cut off');
  });
  it('asks for a few words', () => {
    expect(reasonReady('  ok ')).toBe(false);
    expect(reasonReady('Blurry photo')).toBe(true);
  });
});

describe('expiry', () => {
  it('is valid through the expiry day and expired after', () => {
    expect(expiryCheck('2026-11-03', '2026-11-03')).toEqual({ state: 'valid', days: 0 });
    expect(expiryCheck('2026-12-03', '2026-11-03')).toEqual({ state: 'valid', days: 30 });
    expect(expiryCheck('2026-11-01', '2026-11-03')).toEqual({ state: 'expired', days: 2 });
    expect(expiryCheck(null, '2026-11-03')).toEqual({ state: 'none' });
    expect(expiryCheck('soon', '2026-11-03')).toEqual({ state: 'none' });
  });

  it('reads the right date for each document', () => {
    const vehicles = [{ id: 4, insurance_expiry: '2027-01-01', permit_expiry: null, fitness_expiry: null, puc_expiry: null }];
    expect(expiryFor(doc('license_front', 'x'), '2030-05-05', vehicles)).toBe('2030-05-05');
    expect(expiryFor(doc('insurance', 'x', { owner: 'vehicle', vehicle_id: 4 }), null, vehicles)).toBe('2027-01-01');
    expect(expiryFor(doc('permit', 'x', { owner: 'vehicle', vehicle_id: 4 }), null, vehicles)).toBeNull();
    expect(expiryFor(doc('rc', 'x', { owner: 'vehicle', vehicle_id: 4 }), null, vehicles)).toBeUndefined();
  });

  it('formats today on the local clock', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('pace', () => {
  it('counts drivers and takes the median gap', () => {
    const rows = [
      { created_at: '2026-11-03T10:00:00Z', target_id: '1' },
      { created_at: '2026-11-03T10:01:00Z', target_id: '1' },
      { created_at: '2026-11-03T10:04:00Z', target_id: '2' },
      { created_at: '2026-11-03T10:05:30Z', target_id: '3' },
    ];
    expect(paceFrom(rows)).toEqual({ drivers: 3, medianSeconds: 90 });
  });
  it('says nothing from fewer than two reviews', () => {
    expect(paceFrom([{ created_at: '2026-11-03T10:00:00Z', target_id: '1' }])).toBeNull();
    expect(paceFrom([])).toBeNull();
  });
  it('writes short durations', () => {
    expect(shortDuration(45)).toBe('45s');
    expect(shortDuration(190)).toBe('3m 10s');
    expect(shortDuration(3900)).toBe('1h 5m');
  });
});

describe('files', () => {
  it('spots a PDF by its path', () => {
    expect(looksLikePdf('https://r2.example/docs/a.PDF?X-Amz=1')).toBe(true);
    expect(looksLikePdf('https://r2.example/docs/a.jpg?file=x.pdf')).toBe(false);
  });
});
