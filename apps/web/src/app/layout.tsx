import type { Metadata } from 'next';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
