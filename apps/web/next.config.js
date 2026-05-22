/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The backend serves all data via the existing REST API; we run as a
  // pure SPA-style client app, no server-side data fetching for now.
  // Switch to next-auth + server components in a later phase once we
  // need session-based access controls.
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'https://dev.api.saaradhigo.in/api/v1',
  },
};

module.exports = nextConfig;
