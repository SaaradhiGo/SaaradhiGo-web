import Link from 'next/link';

// Without this, an unknown URL renders Next's default page, which looks like
// a crash rather than a missing page.
export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-4 text-center">
      <div>
        <p className="text-brand font-semibold">404</p>
        <h1 className="mt-2 text-2xl font-bold">We could not find that page</h1>
        <p className="mt-3 text-sm text-white/60 max-w-sm">
          The link may be old, or the page may have moved.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link href="/" className="btn-primary">
            Go to the home page
          </Link>
          <Link
            href="/contact"
            className="btn-ghost border border-white/10 rounded-xl px-4 py-2"
          >
            Contact support
          </Link>
        </div>
      </div>
    </main>
  );
}
