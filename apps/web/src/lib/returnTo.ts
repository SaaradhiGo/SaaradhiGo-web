/**
 * Where to send someone after they sign in or register.
 *
 * ONLY A PATH ON THIS SITE IS EVER HONOURED. A `next` parameter is
 * attacker-controlled: anyone can send a link to
 * `/sign-in?next=https://evil.example/login`, and a site that redirects there
 * after a successful sign-in has handed over a convincing phishing page on
 * its own domain. So the value must start with a single `/` and must not
 * start with `//` (which a browser reads as a protocol-relative URL to
 * another host) or `/\` (which some parsers treat the same way). Anything
 * else is discarded and the caller's own default is used.
 */
export function safeReturnTo(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not a path we are going to navigate to.
    return fallback;
  }
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
