import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/support';
import './globals.css';
import '../styles/fonts.css';

// The root layout now serves BOTH the public site and the ops console, so
// its metadata has to be the neutral default. Each route group overrides it:
// `(public)/layout.tsx` for the marketing pages, and the console pages for
// themselves. Leaving 'Ops Console' here put an internal tool's name in the
// browser tab and in search results for every public page.
// Every webfont is self-hosted from public/fonts (src/styles/fonts.css): builds
// and visitors never fetch fonts from Google (owner, 2026-11-05).

export const metadata: Metadata = {
  // `metadataBase` is what makes every relative canonical, Open Graph and
  // Twitter URL below resolve to an absolute one. Without it Next emits
  // relative og:url values, which crawlers and link unfurlers ignore.
  //
  // It comes from NEXT_PUBLIC_SITE_URL so QA describes itself as QA. A QA
  // deployment that claimed `https://saaradhigo.com` as its canonical would
  // be asking search engines to treat a test database as the real site.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SaaradhiGo',
    template: '%s',
  },
  description: 'SaaradhiGo — ride-hailing in India.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Saaradhi Go',
  appleWebApp: { title: 'Saaradhi Go', capable: true, statusBarStyle: 'black-translucent' },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'SaaradhiGo',
    url: '/',
    title: 'SaaradhiGo',
    description:
      'Book a ride in Hyderabad, Vijayawada, Visakhapatnam and Warangal. '
      + 'The fare is agreed before the trip starts.',
    locale: 'en_IN',
    // NO og:image. There was one, pointing at the homepage photograph, and
    // the photographs are gone. A link preview with a broken image is worse
    // than a link preview with none: one looks unfinished, the other looks
    // broken. This comes back when there is a picture worth sharing.
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SaaradhiGo',
    description: 'Book a ride. The fare is agreed before the trip starts.',
  },
};

// `noir`, so the browser chrome and the area behind a rubber-band scroll match
// the nav rather than flashing white above it.
export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

// THEME SWITCHING IS GONE FROM THE PUBLIC SITE. `data-theme="dark"` on
// <html> is now the whole story: there is no stored preference to read back
// and so no inline script in the <head> at all. The light theme's tokens
// stay in the stylesheet because the console sets `data-theme` itself, but
// the approved public experience is one surface, finished, rather than two
// where only one is.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
    >
      {/* `sg` scopes the design system's box-sizing, family and colour. */}
      <body className="sg">{children}</body>
    </html>
  );
}
