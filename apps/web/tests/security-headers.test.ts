/**
 * Security headers on every page (AUDIT 27.78, M4). Before, the app sent
 * none. Run with `npm test` (node:test).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const load = createRequire(import.meta.url);
const { contentSecurityPolicy, securityHeaders } = load('../security-headers.js');
const nextConfig = load('../next.config.js');

const QA = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.qa.saaradhigo.example/api/v1',
};

function directive(policy: string, name: string): string[] {
  const found = policy.split('; ').find((d) => d.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
}

test('next.config sends the headers on every route', async () => {
  const rules = await nextConfig.headers();
  assert.equal(rules[0].source, '/:path*');
  const keys = rules[0].headers.map((h: { key: string }) => h.key);
  assert.deepEqual(keys.sort(), [
    'Content-Security-Policy', 'Referrer-Policy', 'Strict-Transport-Security',
    'X-Content-Type-Options', 'X-Frame-Options',
  ]);
});

test('the fixed headers', () => {
  const byKey = Object.fromEntries(securityHeaders(QA).map((h: { key: string; value: string }) => [h.key, h.value]));
  assert.equal(byKey['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(byKey['X-Frame-Options'], 'DENY');
  assert.equal(byKey['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(byKey['X-Content-Type-Options'], 'nosniff');
});

test('the CSP allows the API and its socket, and refuses framing and eval', () => {
  const csp = contentSecurityPolicy(QA);
  assert.ok(directive(csp, 'connect-src').includes('https://api.qa.saaradhigo.example'));
  assert.ok(directive(csp, 'connect-src').includes('wss://api.qa.saaradhigo.example'));
  assert.deepEqual(directive(csp, 'frame-ancestors'), ["'none'"]);
  assert.deepEqual(directive(csp, 'object-src'), ["'none'"]);
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.ok(csp.includes('upgrade-insecure-requests'));
  assert.ok(directive(csp, 'style-src').includes('https://fonts.googleapis.com'));
  assert.ok(directive(csp, 'font-src').includes('https://fonts.gstatic.com'));
});

test('an explicit socket origin is used', () => {
  const csp = contentSecurityPolicy({ ...QA, NEXT_PUBLIC_WS_BASE_URL: 'wss://sockets.qa.example/ws' });
  assert.ok(directive(csp, 'connect-src').includes('wss://sockets.qa.example'));
});

test('only next dev gets unsafe-eval', () => {
  assert.ok(contentSecurityPolicy({ NODE_ENV: 'development' }).includes("'unsafe-eval'"));
});

test('KYC document images from R2 are allowed as images only', () => {
  const policy = contentSecurityPolicy({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.test/api/v1' });
  assert.ok(directive(policy, 'img-src').includes('https://*.r2.cloudflarestorage.com'));
  assert.ok(!directive(policy, 'connect-src').includes('https://*.r2.cloudflarestorage.com'));
});
