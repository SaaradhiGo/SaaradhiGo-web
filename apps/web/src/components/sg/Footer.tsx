import Link from 'next/link';
import { Logo } from './Logo';

/**
 * The footer: `noir` in both themes, like the nav, with the full lockup at
 * 150px and three columns of links under Cinzel eyebrows.
 *
 * EVERY LINK HERE GOES SOMEWHERE. The handoff's preview lists "Saaradhi
 * Black", "Airport rides", "Earnings", "About" and "Careers" against `href="#"`,
 * which is right for a design preview and wrong for a deployed site: a footer
 * full of links that do nothing is a worse first impression than a short one,
 * and it is the kind of thing a visitor tries exactly once. So the columns
 * keep the design's shape and carry the routes this app actually serves. The
 * remaining headings come back when their pages do.
 */
const COLUMNS = [
  {
    heading: 'Ride',
    links: [
      { href: '/book', label: 'Book a ride' },
      { href: '/my-trips', label: 'My trips' },
      { href: '/sign-up', label: 'Create an account' },
    ],
  },
  {
    heading: 'Drive',
    links: [
      { href: '/drive', label: 'Drive with us' },
      { href: '/driver/sign-up', label: 'Apply to drive' },
      { href: '/driver/sign-in', label: 'Driver sign-in' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/contact', label: 'Contact' },
      // Staff reach the console directly. Not advertised, but a working link
      // beats a bookmark nobody has.
      { href: '/login', label: 'Staff sign-in' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="sg-footer sg-on-noir">
      <div className="sg-foot">
        <div>
          <Logo variant="lockup" width={150} label="SaaradhiGo" />
        </div>
        {COLUMNS.map((col) => (
          <div key={col.heading}>
            {/* `h2`, not the preview's `h5`: these sit under the page's
                `h1` with no intervening level, and the stylesheet matches
                both tags so the type is unchanged. */}
            <h2>{col.heading.toUpperCase()}</h2>
            {col.links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="sg-foot__base">
        <span>© {new Date().getFullYear()} SaaradhiGo. Made in Hyderabad.</span>
        <span className="flex gap-sg-2">
          <Link href="/privacy">Privacy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Terms</Link>
        </span>
      </div>
    </footer>
  );
}
