import Link from 'next/link';
import { PublicShell } from '@/components/sg/PublicShell';
import { Tr } from '@/i18n/website';

// Without this, an unknown URL renders Next's default page, which looks like
// a crash rather than a missing page. It sits inside the public header and
// footer (owner, 2026-11-07), so the logo and the way home are always there.
export default function NotFound() {
  return (
    <PublicShell>
      <section className="s-wrap s-page s-cb s-missing">
        <p className="t-label">404</p>
        <h1 className="t-heading"><Tr>We could not find that page</Tr></h1>
        <p className="s-lead"><Tr>The link may be old, or the page may have moved.</Tr></p>
        <div className="s-missing__actions">
          <Link href="/" className="s-btn s-btn--primary">
            <Tr>Go to the home page</Tr>
          </Link>
          <Link href="/contact" className="s-btn s-btn--outline">
            <Tr>Contact support</Tr>
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
