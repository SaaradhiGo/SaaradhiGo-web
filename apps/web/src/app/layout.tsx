import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/support';
import './globals.css';

// The root layout now serves BOTH the public site and the ops console, so
// its metadata has to be the neutral default. Each route group overrides it:
// `(public)/layout.tsx` for the marketing pages, and the console pages for
// themselves. Leaving 'Ops Console' here put an internal tool's name in the
// browser tab and in search results for every public page.
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
    // The homepage hero, which is a licensed photograph of a city we serve.
    // No invented brand artwork and no text baked into an image.
    images: [{ url: '/photography/hero-city.jpg', width: 2000, height: 900,
      alt: 'A wide seafront road in Visakhapatnam, India.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SaaradhiGo',
    description: 'Book a ride. The fare is agreed before the trip starts.',
    images: ['/photography/hero-city.jpg'],
  },
};

// `noir`, so the browser chrome and the area behind a rubber-band scroll match
// the nav rather than flashing white above it.
export const viewport: Viewport = {
  themeColor: '#090708',
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* TWO FAMILIES, NOT THREE. Manrope sets every heading, number,
            label and control; Cinzel is the brand lockup and the map labels
            and nothing else.

            Cormorant Garamond is gone. It set the headings on /book and the
            auth pages while the public pages used Manrope, so the typeface
            changed under a visitor mid-journey -- and it has no Telugu or
            Devanagari coverage, so those locales fell back to a third face
            again. Dropping it removes the inconsistency and one
            render-blocking font request with it.

            `display=swap` so text is readable while they load: a
            ride-hailing page that hides its fares behind a webfont has
            failed at the one thing it is for. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href={
            'https://fonts.googleapis.com/css2'
            + '?family=Manrope:wght@500;600;700;800'
            + '&family=Cinzel:wght@500;600;700'
            + '&display=swap'
          }
        />
      </head>
      {/* `sg` scopes the design system's box-sizing, family and colour. */}
      <body className="sg">{children}</body>
    </html>
  );
}
