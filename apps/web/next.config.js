/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The backend serves all data via the existing REST API; we run as a
  // pure SPA-style client app, no server-side data fetching for now.
  // Switch to next-auth + server components in a later phase once we
  // need session-based access controls.
  // THE FALLBACK IS LOCALHOST, NOT A PUBLIC HOSTNAME.
  //
  // It used to be `https://dev.api.saaradhigo.in/api/v1`, which resolves
  // (16.112.4.47) but does not answer on 443 -- so a build that forgot to
  // set the variable produced a site that looked configured and silently
  // failed every request against a dead host. Falling back to the local
  // backend makes that mistake obvious on the machine that made it, and
  // matches what `src/lib/api.ts` already defaults to.
  //
  // The production target is https://api.saaradhigo.com/api/v1. It is NOT
  // the default here, and must not become one until that hostname exists:
  // a default pointing at a host that does not resolve is the same trap in
  // a new domain. QA and production both set the variable explicitly.
  // THE OPTIMISER PRODUCES THE MODERN FORMATS; THE REPOSITORY DOES NOT.
  //
  // `public/photography` holds one JPEG master per slot at 2400x1600. Next
  // re-encodes per request to AVIF first, then WebP, then the original, and
  // picks a width from the list below by what the `sizes` attribute asks
  // for. Committing a pre-built pyramid of AVIF and WebP at a dozen widths
  // would duplicate exactly this, double the repository and go stale the
  // first time a breakpoint moves.
  //
  // AVIF is listed before WebP so a browser that takes both gets the
  // smaller one -- typically 30-50% under WebP on these photographs.
  //
  // The cache TTL is long because these files are content, not config: a
  // changed photograph gets a changed path, not a changed byte at the same
  // path.
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [320, 390, 640, 768, 1024, 1280, 1600, 1920, 2400],
    imageSizes: [96, 160, 240, 360, 480],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1',
  },
};

module.exports = nextConfig;
