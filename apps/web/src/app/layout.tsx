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
  appleWebApp: { title: 'Saaradhi Go', capable: true, statusBarStyle: 'default' },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'SaaradhiGo',
    url: '/',
    title: 'SaaradhiGo',
    description:
      'Fair rides for riders and drivers. The fare is agreed before the trip starts.',
    // The server renders English; the other languages are a stored
    // preference on the same URL, and LocaleHead switches this tag in the
    // browser (owner, 2026-11-07).
    locale: 'en_IN',
    alternateLocale: ['te_IN', 'hi_IN', 'es_ES'],
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

// The browser chrome follows the theme: ivory in Daylight, black in dark.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'light dark',
};

// DAYLIGHT IS THE DEFAULT (owner, 2026-11-06); black and gold is the dark
// option. The visitor's choice lives in localStorage and a cookie
// (`sg-theme`). This runs before first paint, so the page never flashes the
// other theme. The console and its sign-in set `data-theme` themselves.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('sg-theme');if(t!=='light'&&t!=='dark'){var m=document.cookie.match(/(?:^|; )sg-theme=(light|dark)/);t=m?m[1]:'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* `sg` scopes the design system's box-sizing, family and colour. */}
      <body className="sg">{children}</body>
    </html>
  );
}
