/**
 * "We couldn't load" with its real reason (10 Nov): the endpoint, the status and the server's
 * message go to Sentry when NEXT_PUBLIC_SENTRY_DSN is set, and to the console always. No SDK:
 * one envelope POST to the DSN's own store, so the page pays nothing until something fails.
 */
import { ApiError } from './api';

export type LoadFailure = { endpoint: string | null; status: number | 'timeout' | null; code: string | null; reason: string };

/** Marks an error with the API path it came from. */
export function tagEndpoint(e: unknown, path: string): unknown {
  if (e && typeof e === 'object' && !('endpoint' in e)) (e as { endpoint?: string }).endpoint = path.split('?')[0];
  return e;
}

export function failureOf(e: unknown): LoadFailure {
  const endpoint = (e as { endpoint?: string } | null)?.endpoint ?? null;
  if (e instanceof ApiError) return { endpoint, status: e.status, code: e.code || null, reason: e.message };
  if (e === 'timeout') return { endpoint, status: 'timeout', code: null, reason: 'No answer in 10 seconds' };
  return { endpoint, status: null, code: null, reason: e instanceof Error ? e.message : String(e) };
}

function envelopeUrl(dsn: string): { url: string; dsn: string } | null {
  const m = /^(https?):\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn.trim());
  return m ? { url: `${m[1]}://${m[3]}/api/${m[4]}/envelope/?sentry_key=${m[2]}&sentry_version=7`, dsn } : null;
}

export function reportLoadError(e: unknown, what?: string): LoadFailure {
  const f = failureOf(e);
  // eslint-disable-next-line no-console
  console.error('[load]', what ?? '', f.endpoint, f.status, f.code, f.reason);
  const target = envelopeUrl(process.env.NEXT_PUBLIC_SENTRY_DSN ?? '');
  if (!target || typeof window === 'undefined') return f;
  const id = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: id, level: 'error', platform: 'javascript', timestamp: Date.now() / 1000,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT || undefined,
    message: { formatted: `We couldn't load ${what ?? f.endpoint ?? 'a card'}: ${f.status ?? 'error'} ${f.reason}` },
    fingerprint: ['area-load', f.endpoint ?? what ?? 'unknown', String(f.status)],
    tags: { endpoint: f.endpoint ?? 'unknown', status: String(f.status ?? 'none'), page: window.location.pathname },
    extra: { code: f.code, reason: f.reason },
  };
  const body = [JSON.stringify({ event_id: id, dsn: target.dsn }), JSON.stringify({ type: 'event' }), JSON.stringify(event)].join('\n');
  fetch(target.url, { method: 'POST', body, keepalive: true }).catch(() => {});
  return f;
}
