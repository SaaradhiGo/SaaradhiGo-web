/**
 * Which environment this console is talking to, said out loud.
 *
 * Plenty of real incidents start with an operator doing real work in QA,
 * or a test action in production, because the two screens look identical.
 * So the badge is on the sign-in page and in every page's top bar, and
 * production gets a treatment nothing else gets.
 *
 * IT FAILS TOWARDS PRODUCTION. The one unacceptable outcome is the live
 * platform labelled "QA": somebody believes it and does a test action on
 * real riders. So anything this cannot classify WITH CERTAINTY is shown as
 * production -- a missing setting, a hostname it does not recognise, a
 * value it cannot parse. Local and QA have to earn their labels.
 *
 * `NEXT_PUBLIC_CONSOLE_ENV` wins when set to a known value. Otherwise the
 * hostname of `NEXT_PUBLIC_SITE_URL` is read: `localhost`/`127.0.0.1` is
 * local; a hostname LABEL of `qa` or `staging` (a whole label between dots
 * or hyphens, so `web-qa-800c.up.railway.app` and `qa.saaradhigo.com`
 * count and `qatar.example.com` does not) is that environment; everything
 * else is production. Tested in tests/console-env.test.ts.
 */
export type ConsoleEnv = 'production' | 'staging' | 'qa' | 'local';

export function deriveConsoleEnv(
  explicit: string | undefined | null,
  siteUrl: string | undefined | null,
): ConsoleEnv {
  const e = (explicit || '').trim().toLowerCase();
  if (e === 'production' || e === 'prod') return 'production';
  if (e === 'staging') return 'staging';
  if (e === 'qa') return 'qa';
  if (e === 'local' || e === 'dev' || e === 'development') return 'local';
  // Set, but to something this does not know. Not a guess: production.
  if (e) return 'production';

  let host: string;
  try {
    host = new URL((siteUrl || '').trim()).hostname.toLowerCase();
  } catch {
    return 'production';
  }
  if (!host) return 'production';
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')) {
    return 'local';
  }
  const labels = host.split(/[.-]/);
  if (labels.includes('staging')) return 'staging';
  if (labels.includes('qa')) return 'qa';
  return 'production';
}

export const CONSOLE_ENV: ConsoleEnv = deriveConsoleEnv(
  process.env.NEXT_PUBLIC_CONSOLE_ENV,
  process.env.NEXT_PUBLIC_SITE_URL,
);

export const ENV_LABEL: Record<ConsoleEnv, string> = {
  production: 'Production',
  staging: 'Staging',
  qa: 'QA',
  local: 'Local',
};

export const IS_PRODUCTION = CONSOLE_ENV === 'production';

/**
 * How many wrong passwords in a row this browser tolerates before it shows
 * the locked state. The SERVER enforces its own lockout and answers it with
 * the same refusal as a wrong password (so the form is not an oracle); this
 * number only decides when the console stops offering the form and says
 * "paused" instead. Configurable because the server's threshold is.
 */
export const LOGIN_LOCK_AFTER = Math.max(
  2,
  Number(process.env.NEXT_PUBLIC_LOGIN_LOCK_AFTER) || 5,
);

/** The server's lockout window, in minutes, as told to the operator. */
export const LOGIN_LOCK_MINUTES = 15;
