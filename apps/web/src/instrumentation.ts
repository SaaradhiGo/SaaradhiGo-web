/**
 * Startup check (9 Nov): the web session cookie is signed with WEB_SESSION_SECRET. Without it (or
 * shorter than 32 characters) a random key made at build time is used, so every deploy signs
 * everyone out: the clean sign-out on a stale session still works, but it happens on each release.
 * The secret is read from the environment only; it is listed in config-required.md.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;
  const secret = process.env.WEB_SESSION_SECRET ?? '';
  if (secret.length < 32) {
    // eslint-disable-next-line no-console
    console.warn(
      secret
        ? 'WEB_SESSION_SECRET is shorter than 32 characters and is ignored: sign-ins end at every deploy.'
        : 'WEB_SESSION_SECRET is not set: sign-ins end at every deploy (a build-time key is used).',
    );
  }
}
