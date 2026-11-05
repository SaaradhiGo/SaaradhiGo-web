// Security headers for every page this app serves (AUDIT 27.78, M4).
//
// The console and the public site had none: no CSP, no HSTS, no framing
// rule. Each allowance below is something the app actually loads -- read
// from the code, not copied from a template -- so the list is also the
// inventory:
//
//   'self'                      the app's own pages, chunks, /_next/image
//   API origin (+ its ws/wss)    NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_WS_BASE_URL:
//                                REST calls and the live-ops / booking sockets
//   fonts.googleapis.com         Google Maps' own font stylesheet (site fonts are self-hosted)
//   fonts.gstatic.com            the font files Maps' stylesheet points at
//   *.googleapis.com, *.gstatic.com, *.google.com, *.googleusercontent.com
//                                the Maps JavaScript API (lib/googleMaps.ts): its
//                                loader, tiles, markers and the requests it makes,
//                                as Google's CSP guide lists them
//
// 'unsafe-inline' in script-src: the App Router writes its flight data as
// inline <script> tags on every page, and the only alternative is a
// per-request nonce, which turns every statically generated page dynamic.
// 'unsafe-inline' in style-src: React style attributes and the styles the
// Maps library injects. 'unsafe-eval' is NOT allowed; `next dev` needs it for
// fast refresh, so it is added only when NODE_ENV is 'development'.

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function socketOrigin(httpOrigin) {
  if (!httpOrigin) return null;
  return httpOrigin.replace(/^http(s?):/, (_m, s) => `ws${s}:`);
}

function contentSecurityPolicy(env = process.env) {
  const api = originOf(env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1');
  const ws = originOf(env.NEXT_PUBLIC_WS_BASE_URL || '') || socketOrigin(api);
  const dev = env.NODE_ENV === 'development';
  const google = ['https://*.googleapis.com', 'https://*.gstatic.com'];

  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...google, ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', ...google, 'https://*.google.com',
      'https://*.googleusercontent.com',
      // KYC documents are shown from short-lived signed URLs on Cloudflare R2 (QA storage since 2026-11-03).
      'https://*.r2.cloudflarestorage.com'],
    'connect-src': ["'self'", api, ws, ...google, 'https://*.google.com'].filter(Boolean),
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (api && api.startsWith('https:')) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

function securityHeaders(env = process.env) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(env) },
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
  ];
}

module.exports = { contentSecurityPolicy, securityHeaders };
