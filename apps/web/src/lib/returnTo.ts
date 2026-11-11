/**
 * Where to send someone after they sign in or register.
 *
 * ONLY A PATH ON THIS SITE IS EVER HONOURED. A `next` parameter is
 * attacker-controlled: anyone can send a link to
 * `/sign-in?next=https://evil.example/login`, and a site that redirects there
 * after a successful sign-in has handed over a convincing phishing page on
 * its own domain.
 *
 * PREFIX CHECKS WERE NOT ENOUGH (AUDIT 27.78, M2/M3). The value used to be
 * accepted if it started with one `/` and not `//` or `/\`. Browsers strip
 * tab, newline and carriage return from URLs and read `\` as `/`, so
 * `/\t/evil.example` and `/%09/evil.example` passed the check and still
 * navigated off-site. The value is now RESOLVED the way the browser will
 * resolve it -- `new URL(value, origin)` -- and accepted only if it stays on
 * this origin, after refusing control characters and backslashes outright.
 */

// Control characters (C0 and DEL) and backslashes, anywhere in the value.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

function currentOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  // Outside a browser (tests, prerender) any fixed origin does: only
  // "same origin as this one" is being asked.
  return 'https://console.invalid';
}

export function safeReturnTo(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not a path we are going to navigate to.
    return fallback;
  }
  // Checked on both forms: `%09` and a literal tab must both be refused.
  if (UNSAFE.test(raw) || UNSAFE.test(value)) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;

  const origin = currentOrigin();
  let resolved: URL;
  try {
    resolved = new URL(value, origin);
  } catch {
    return fallback;
  }
  if (resolved.origin !== origin) return fallback;
  if (!resolved.pathname.startsWith('/') || resolved.pathname.startsWith('//')) return fallback;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
