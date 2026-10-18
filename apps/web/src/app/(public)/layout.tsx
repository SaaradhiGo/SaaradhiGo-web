import type { Metadata } from 'next';
import Link from 'next/link';

// The public site and the ops console share one Next app and nothing else.
// This layout wraps only the `(public)` group, so the console keeps its own
// chrome: a visitor never sees operator navigation, and an operator never
// sees a marketing header.
export const metadata: Metadata = {
  title: 'SaaradhiGo — book a ride',
  description:
    'SaaradhiGo is a ride-hailing service. See the fare before you book, '
    + 'pay the way that suits you, and get a receipt for every ride. Create '
    + 'a rider account, or apply to drive.',
};

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/book', label: 'Book a ride' },
  { href: '/drive', label: 'Drive with us' },
  { href: '/contact', label: 'Contact' },
];

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

      <header className="border-b border-white/5 sticky top-0 bg-ink-900/95 backdrop-blur z-40">
        <nav
          className="mx-auto max-w-5xl px-4 h-16 flex items-center gap-6"
          aria-label="Main"
        >
          <Link href="/" className="text-brand font-bold text-lg shrink-0">
            SaaradhiGo
          </Link>
          <div className="hidden sm:flex items-center gap-5 text-sm">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="btn-ghost">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/sign-in" className="btn-ghost px-2">
              Sign in
            </Link>
            <Link href="/sign-up" className="btn-primary text-sm px-4 py-2">
              Sign up
            </Link>
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1 mx-auto w-full max-w-5xl px-4 py-10">
        {children}
      </main>

      <footer className="border-t border-white/5 mt-12">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-white/50">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
            <p>© {new Date().getFullYear()} SaaradhiGo</p>
            <div className="sm:ml-auto flex flex-wrap gap-x-5 gap-y-2">
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
