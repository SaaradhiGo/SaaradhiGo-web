import type { Metadata } from 'next';
import Link from 'next/link';

// The public site and the ops console share one Next app but nothing else.
// This layout wraps only the `(public)` group, so the console keeps its own
// bare chrome and its own metadata -- a visitor should never see operator
// navigation, and an operator should never see a marketing header.
export const metadata: Metadata = {
  title: 'SaaradhiGo — rides across India',
  description:
    'SaaradhiGo is a ride-hailing service operating a controlled pilot in '
    + 'India. Book rides from the Android app; drive with us and get paid '
    + 'per trip.',
};

const navLinks = [
  { href: '/', label: 'Home' },
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
      <header className="border-b border-white/5">
        <nav
          className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-6"
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
          <div className="ml-auto flex items-center gap-3">
            <Link href="/sign-in" className="btn-ghost">
              Sign in
            </Link>
            <Link href="/sign-up" className="btn-primary text-sm">
              Sign up
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-10">
        {children}
      </main>

      <footer className="border-t border-white/5 mt-12">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-white/50 flex flex-col sm:flex-row gap-4 sm:items-center">
          <p>© {new Date().getFullYear()} SaaradhiGo</p>
          <div className="sm:ml-auto flex flex-wrap gap-5">
            <Link href="/privacy" className="btn-ghost">
              Privacy
            </Link>
            <Link href="/terms" className="btn-ghost">
              Terms
            </Link>
            <Link href="/contact" className="btn-ghost">
              Contact
            </Link>
            {/* Operators reach the console directly; it is not advertised
                to visitors, but a working link beats a bookmark nobody has. */}
            <Link href="/login" className="btn-ghost">
              Operator sign-in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
