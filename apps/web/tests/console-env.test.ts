/**
 * The environment badge must fail towards PRODUCTION.
 *
 * The badge exists so nobody does a test action on the live platform. The
 * one outcome it must never produce is "QA" on production, so every case
 * this cannot classify with certainty has to come out as production, and
 * QA/local have to earn their labels from an exact setting or a hostname
 * label. Run with `npm test` (node:test; no framework).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveConsoleEnv } from '../src/lib/consoleEnv.ts';

test('an explicit setting wins', () => {
  assert.equal(deriveConsoleEnv('qa', 'https://saaradhigo.com'), 'qa');
  assert.equal(deriveConsoleEnv('staging', 'https://saaradhigo.com'), 'staging');
  assert.equal(deriveConsoleEnv('production', 'http://localhost:3000'), 'production');
  assert.equal(deriveConsoleEnv(' PROD ', undefined), 'production');
  assert.equal(deriveConsoleEnv('local', 'https://saaradhigo.com'), 'local');
  assert.equal(deriveConsoleEnv('development', undefined), 'local');
});

test('an explicit setting that is not understood is production, not a guess', () => {
  assert.equal(deriveConsoleEnv('test', 'https://web-qa-800c.up.railway.app'), 'production');
  assert.equal(deriveConsoleEnv('QA1', 'http://localhost:3000'), 'production');
});

test('nothing set at all is production', () => {
  assert.equal(deriveConsoleEnv(undefined, undefined), 'production');
  assert.equal(deriveConsoleEnv('', ''), 'production');
  assert.equal(deriveConsoleEnv(null, null), 'production');
});

test('a site URL that cannot be parsed is production', () => {
  assert.equal(deriveConsoleEnv(undefined, 'not a url'), 'production');
  assert.equal(deriveConsoleEnv(undefined, 'qa.saaradhigo.com'), 'production'); // no scheme
  assert.equal(deriveConsoleEnv(undefined, 'https://'), 'production');
});

test('the public hostname is production', () => {
  assert.equal(deriveConsoleEnv(undefined, 'https://saaradhigo.com'), 'production');
  assert.equal(deriveConsoleEnv(undefined, 'https://console.saaradhigo.com'), 'production');
  assert.equal(deriveConsoleEnv(undefined, 'https://web-prod-1a2b.up.railway.app'), 'production');
});

test('QA and staging are recognised only as whole hostname labels', () => {
  assert.equal(deriveConsoleEnv(undefined, 'https://web-qa-800c.up.railway.app'), 'qa');
  assert.equal(deriveConsoleEnv(undefined, 'https://qa.saaradhigo.com'), 'qa');
  assert.equal(deriveConsoleEnv(undefined, 'https://www.qa.saaradhigo.com'), 'qa');
  assert.equal(deriveConsoleEnv(undefined, 'https://staging.saaradhigo.com'), 'staging');
  // "qa" inside a word is not QA.
  assert.equal(deriveConsoleEnv(undefined, 'https://qatar.saaradhigo.com'), 'production');
  assert.equal(deriveConsoleEnv(undefined, 'https://aqua.saaradhigo.com'), 'production');
  // A path or query cannot make it QA either.
  assert.equal(deriveConsoleEnv(undefined, 'https://saaradhigo.com/qa?env=qa'), 'production');
});

test('local is only the loopback names', () => {
  assert.equal(deriveConsoleEnv(undefined, 'http://localhost:3099'), 'local');
  assert.equal(deriveConsoleEnv(undefined, 'http://127.0.0.1:3099'), 'local');
  assert.equal(deriveConsoleEnv(undefined, 'http://console.localhost'), 'local');
  assert.equal(deriveConsoleEnv(undefined, 'http://192.168.4.24:3099'), 'production');
});
