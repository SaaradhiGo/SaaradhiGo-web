import type { Metadata } from 'next';
import { HomeContent } from '@/components/home/HomeContent';

/**
 * The SaaradhiGo public homepage.
 *
 * The page itself is a thin server component so the route keeps its
 * metadata; everything below the fold is in `HomeContent`, which needs the
 * locale and therefore the client.
 */
export const metadata: Metadata = {
  title: 'SaaradhiGo — Your city. Your ride.',
  description:
    "Wherever you're headed, find a ride that works for you. See the fare "
    + 'before you book, share a PIN to start, and track the trip live.',
  // NO `hreflang` HERE, DELIBERATELY. The five locales share one URL --
  // the preference is stored, not routed -- and `hreflang` declares that a
  // DIFFERENT URL serves a different language. Pointing all five at `/` is
  // an invalid signal, which Lighthouse scores as such and a crawler would
  // either ignore or act on wrongly.
  //
  // To do this properly: serve the locales on their own paths
  // (`/en-IN`, `/te-IN`, ...) and declare absolute URLs for each, with
  // `x-default` on the English one. That is locale routing, which is a
  // larger change than this page.
};

export default function HomePage() {
  return <HomeContent />;
}
