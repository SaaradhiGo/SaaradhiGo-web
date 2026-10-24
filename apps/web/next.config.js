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
  // matches what `src/lib/api.ts` already defaults to. The QA and
  // production services set the variable, so neither is affected.
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1',
  },
};

module.exports = nextConfig;
