import type { Metadata } from 'next';
import Link from 'next/link';
import SiteNav from '@/components/SiteNav';

// The public site and the ops console share one Next app and nothing else.
// This layout wraps only the `(public)` group, so the console keeps its own
// chrome: a visitor never sees operator navigation, and an operator never
// sees a marketing header.
//
// WIDTH: the container was max-w-5xl (1024px), which on a 1440px desktop left
// a third of the screen empty and made a booking product feel like a blog.
// Pages now opt into their own width -- the homepage goes full-bleed so the
// booking panel and the map can sit side by side -- and this layout no longer
// imposes a column on everything.
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
    <div className="min-h-screen flex flex-col">
      {/* First stop for a keyboard user, so they are not forced through the
          whole nav on every page. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <SiteNav />

      {/* A container, but a wide one, and pages that want the whole screen
          break out of it with `.full-bleed` rather than every other page
          losing its gutters. */}
      <main
        id="main"
        className="flex-1 w-full mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-10 py-8 sm:py-10"
      >
        {children}
      </main>

      <footer className="border-t border-white/[0.06] mt-auto">
        <div className="mx-auto max-w-[88rem] px-4 sm:px-6 lg:px-10 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="grid place-items-center h-7 w-7 rounded-md bg-brand text-black font-black text-xs"
              >
                S
              </span>
              <p className="text-sm text-white/50">
                © {new Date().getFullYear()} SaaradhiGo
              </p>
            </div>
            <div className="sm:ml-auto flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <Link href="/drive" className="btn-ghost">
                Drive with us
              </Link>
              <Link href="/contact" className="btn-ghost">
                Contact
              </Link>
              <Link href="/privacy" className="btn-ghost">
                Privacy
              </Link>
              <Link href="/terms" className="btn-ghost">
                Terms
              </Link>
              {/* Staff reach the console directly. Not advertised, but a
                  working link beats a bookmark nobody has. */}
              <Link href="/login" className="btn-ghost">
                Staff sign-in
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
