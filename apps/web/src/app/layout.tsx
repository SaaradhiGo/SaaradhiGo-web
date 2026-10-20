import type { Metadata, Viewport } from 'next';
import './globals.css';

// The root layout now serves BOTH the public site and the ops console, so
// its metadata has to be the neutral default. Each route group overrides it:
// `(public)/layout.tsx` for the marketing pages, and the console pages for
// themselves. Leaving 'Ops Console' here put an internal tool's name in the
// browser tab and in search results for every public page.
export const metadata: Metadata = {
  title: {
    default: 'SaaradhiGo',
    template: '%s',
  },
  description: 'SaaradhiGo — ride-hailing in India.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Saaradhi Go',
  appleWebApp: { title: 'Saaradhi Go', capable: true, statusBarStyle: 'black-translucent' },
};

// `noir`, so the browser chrome and the area behind a rubber-band scroll match
// the nav rather than flashing white above it.
export const viewport: Viewport = {
  themeColor: '#090708',
  colorScheme: 'dark light',
};

/**
 * Applied before first paint, in the <head>, deliberately.
 *
 * `data-theme="dark"` is the default and is already on the <html> element, so
 * a visitor who has never chosen gets the dark theme with no script at all.
 * This exists only for the one who HAS chosen light: without it the page
 * paints dark and then flips, which is worse than either theme.
 *
 * It touches one attribute and reads one key. A `try` because Safari in
 * private browsing throws on `localStorage` rather than returning null.
 */
const applyStoredTheme = `try{var t=localStorage.getItem('sg-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* The three families the design system names, and only those:
            Cormorant Garamond for headlines and promises, Manrope for every
            number, label and control, Cinzel for the brand name, eyebrows and
            map labels. `display=swap` so text is readable while they load --
            a ride-hailing page that hides its fares behind a webfont has
            failed at the one thing it is for. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href={
            'https://fonts.googleapis.com/css2'
            + '?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700'
            + '&family=Manrope:wght@500;600;700;800'
            + '&family=Cinzel:wght@500;600;700'
            + '&display=swap'
          }
        />
        <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
      </head>
      {/* `sg` scopes the design system's box-sizing, family and colour. */}
      <body className="sg">{children}</body>
    </html>
  );
}
