import { CONSOLE_ENV, ENV_LABEL } from '@/lib/consoleEnv';

/**
 * The environment, as a label an operator cannot miss.
 *
 * ALWAYS A WORD. Production is the one that is filled gold, so it is
 * different at a glance from every other environment; but the word is
 * what carries it, because a screenshot in a ticket may be greyscale and
 * so may the person reading it.
 */
export function EnvBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`ops-env ops-env--${CONSOLE_ENV} ops-env--${size}`}
      data-env={CONSOLE_ENV}
      title={CONSOLE_ENV === 'production'
        ? 'This is the live platform. Actions here affect real riders and drivers.'
        : `This is the ${ENV_LABEL[CONSOLE_ENV]} environment. Nothing here reaches a real customer.`}
    >
      <span className="sr-only">Environment: </span>
      {ENV_LABEL[CONSOLE_ENV]}
    </span>
  );
}
