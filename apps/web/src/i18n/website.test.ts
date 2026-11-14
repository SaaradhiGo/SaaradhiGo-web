/**
 * The website translations (design/i18n, 2026-11-07): every English string
 * the public pages show is either in the files or on the MISSING list below,
 * which is what the report hands the reviewer. Nothing is translated by us.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './website/en.json';
import { SITE } from './site';
import { AREA_KEYS } from './strings';
import { WEBSITE, translate } from './website';

/** Shown on the public pages, not in the translation files: stays English. */
const MISSING = [
  // SiteCopy
  'Ride now', 'Schedule', 'Trip type', // the hidden Schedule switch
  'Mobile number · we text a code', 'Confirm', // unused phone variants
  // 14 Nov mobile UX: English until the reviewer translates them.
  'A driver is free now', 'Your fare is ready. Book before it changes.',
  'We are checking every 30 seconds while this page is open, for 10 minutes. Keep it open and we will tell you.',
  'Drivers come free all the time. Try again in a minute, or we can keep checking for you.',
  'A driver is free now. Your fare is ready to book.', 'Log in to book this ride. Your trip and fare are kept.',
  // 13 Nov launch approvals: English until the reviewer translates them.
  'Country', 'Registered office', 'file number', 'Tell me when we launch',
  'SaaradhiGo is not available in this area yet.', 'We could not save that. Please try again.',
  // 13 Nov follow-up: account deletion.
  'Your account closes after your earnings are paid.', 'Delete your account',
  'Closing: waiting for your earnings to be paid.', 'What we delete', 'What we must keep',
  'You are still owed {amount}. Your account closes after it is paid; until then you stay signed in and cannot go online.',
  'Type DELETE to confirm', 'Keep my account',
  // 13 Nov apps follow-up: trip summary and owing on closure.
  'Closing: waiting for what you owe to be settled.', 'Paid {fare} in cash', 'Paid {fare} online',
  'Your driver', '{n} stars',
  // 13 Nov, public-site UX: role gate, account switch, globe panel, example request
  'Driver home', 'Example ride request', 'That did not work. Try again.', 'Back to driver home', 'Back to booking',
  'Sign in to drive', 'Sign in to ride', 'This page needs you to be signed in.', 'Sign in',
  'This page is for driving', 'This page is for riding',
  'You are using SaaradhiGo as a rider right now. Switch to driving to open it. Nothing about your rides changes.',
  'You are using SaaradhiGo as a driver right now. Switch to riding to open it. Nothing about your driving changes.',
  'Switch to driving', 'Switch to riding', 'Ride with your SaaradhiGo account',
  'Book rides with the account you drive with: same name, same mobile number, no new sign-up. Your driving is not affected.',
  'Ride with this account', 'Driver pages need a driver account. See what you need and how to apply.',
  'Example from the Hyderabad rate card', 'Example', 'Language and country', 'Country sets the company, currency and policies.',
  // 13 Nov, review fixes: the payout card on phones
  'Provider fee', 'You received',
];

/** Class names the rider app shows in Latin script in every language. */
const VEHICLES = ['Auto', 'Mini', 'Sedan', 'SUV'];

const enKeys = new Set(Object.keys(en));

function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => leaves(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== 'href') leaves(v, out);
  }
  return out;
}

/** tr('…') and <Tr>…</Tr> literals across the public code. */
function literals(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'console' && name !== '(console)') walk(p); continue; }
      if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'\)/g)) out.push(m[1].replace(/\\'/g, "'"));
      for (const m of src.matchAll(/\btr\(\w+ === '\w+' \? '([^']*)' : '([^']*)'\)/g)) out.push(m[1], m[2]);
      for (const m of src.matchAll(/<Tr>([^<]*)<\/Tr>/g)) out.push(m[1]);
    }
  };
  walk(path.resolve(__dirname, '..'));
  return out;
}

describe('website translations', () => {
  it('has the same English keys in every file', () => {
    for (const l of ['te', 'hi', 'es'] as const) {
      expect(Object.keys(WEBSITE[l]).sort()).toEqual([...new Set([...enKeys, ...AREA_KEYS])].sort());
    }
  });

  it('keeps the signed-in drafts complete and marked for review', () => {
    for (const l of ['te', 'hi', 'es']) {
      const file = JSON.parse(readFileSync(path.resolve(__dirname, `area/${l}.json`), 'utf8'));
      expect(file._review).toMatch(/needs native review/);
      expect(Object.keys(file).filter((k) => k !== '_review').sort()).toEqual([...AREA_KEYS].sort());
    }
  });

  it('covers every public string, apart from the listed missing ones', () => {
    const strings = new Set([...leaves(SITE.en), ...literals()]);
    const uncovered = [...strings].filter(
      (s) => !enKeys.has(s) && translate('te', s) === s && !MISSING.includes(s) && !VEHICLES.includes(s),
    );
    expect(uncovered).toEqual([]);
    for (const s of MISSING) expect(enKeys.has(s)).toBe(false);
  });

  it('keeps both links in the agreement line', () => {
    for (const l of ['en', 'te', 'hi', 'es'] as const) {
      expect(SITE[l].auth.agree).toContain('{terms}');
      expect(SITE[l].auth.agree).toContain('{privacy}');
    }
  });

  it('names the vehicles as the rider app does, in Latin script', () => {
    for (const l of ['te', 'hi', 'es'] as const) {
      expect(SITE[l].home.mockClasses).toEqual(['Auto', 'Mini', 'Sedan']);
      expect(SITE[l].ride.steps[1].body.startsWith('Auto, Mini, Sedan, SUV,')).toBe(true);
      expect(SITE[l].home.mockBook).toContain('Auto');
    }
  });

  it('translates the renamed Log in title from the files', () => {
    expect(translate('te', 'Log in — SaaradhiGo')).toBe(WEBSITE.te['Sign in — SaaradhiGo']);
    expect(translate('en', 'Log in — SaaradhiGo')).toBe('Log in — SaaradhiGo');
  });
});
