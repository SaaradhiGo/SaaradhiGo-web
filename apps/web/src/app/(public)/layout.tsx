import type { Metadata } from 'next';
import { NavBar } from '@/components/sg/NavBar';
import { Footer } from '@/components/sg/Footer';
import { LocaleProvider } from '@/i18n/LocaleProvider';

// The public site and the ops console share one Next app and nothing else.
// This layout wraps only the `(public)` group, so the console keeps its own
// chrome: a visitor never sees operator navigation, and an operator never
// sees a marketing header.
//
// WIDTH: this layout imposes no container at all. The homepage hero and the
// booking workspace are full-bleed by design -- a map with a panel floating
// over it cannot live inside a centred column -- and the pages that do want
// gutters take them from `.sg-wrap` / `.sg-section`, which carry the design
// system's 64px gutters and 96px section rhythm. An earlier version centred
// everything in 1024px, which on a 1440px desktop left a third of the screen
// empty and made a booking product feel like a blog.
export const metadata: Metadata = {
  title: 'SaaradhiGo — book a ride',
  description:
    'SaaradhiGo is a ride-hailing service. See the fare before you book, '
    + 'pay the way that suits you, and get a receipt for every ride. Create '
    + 'a rider account, or apply to drive.',
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
    <div className="min-h-screen flex flex-col bg-bg-000">
      {/* First stop for a keyboard user, so they are not forced through the
          whole nav on every page. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <NavBar />

      <main id="main" className="flex-1 w-full">
        {children}
      </main>

      <Footer />
    </div>
    </LocaleProvider>
  );
}
