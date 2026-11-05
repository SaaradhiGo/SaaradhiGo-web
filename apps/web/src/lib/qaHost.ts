/**
 * Hosts where the sign-in review strip may render. A second, runtime lock
 * behind the build-time flag: a build mis-flagged for the real console host
 * still shows nothing. Unknown hosts are not QA.
 */
const EXACT = new Set(['localhost', '127.0.0.1', 'qa.saaradhigo.com', 'www.qa.saaradhigo.com']);

export function isQaHost(hostname: string | null | undefined): boolean {
  const h = (hostname ?? '').trim().toLowerCase();
  if (EXACT.has(h)) return true;
  return h.endsWith('.up.railway.app') && h.split(/[.-]/).includes('qa');
}

export const onQaHost = () => typeof window !== 'undefined' && isQaHost(window.location.hostname);
