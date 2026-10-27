/**
 * Which environment this console is talking to, said out loud.
 *
 * Plenty of real incidents start with an operator doing real work in QA,
 * or a test action in production, because the two screens look identical.
 * So the badge is on the sign-in page and in every page's top bar, and
 * production gets a treatment nothing else gets.
 *
 * It is read from `NEXT_PUBLIC_CONSOLE_ENV` when set, and derived from the
 * site URL otherwise -- the QA deployment already describes itself as QA
 * through `NEXT_PUBLIC_SITE_URL`, so nothing needs configuring for the
 * badge to be right there. "Unknown" is never shown: a build that cannot
 * tell is labelled LOCAL, which is wrong in a way somebody will notice.
 */
export type ConsoleEnv = 'production' | 'staging' | 'qa' | 'local';

function derive(): ConsoleEnv {
  const explicit = (process.env.NEXT_PUBLIC_CONSOLE_ENV || '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'prod') return 'production';
  if (explicit === 'staging') return 'staging';
  if (explicit === 'qa') return 'qa';
  if (explicit === 'local' || explicit === 'dev' || explicit === 'development') return 'local';

  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').toLowerCase();
  if (!site || site.includes('localhost') || site.includes('127.0.0.1')) return 'local';
  if (site.includes('staging')) return 'staging';
  if (site.includes('qa')) return 'qa';
  // A real public hostname with no environment word in it is production.
  return 'production';
}

export const CONSOLE_ENV: ConsoleEnv = derive();

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
