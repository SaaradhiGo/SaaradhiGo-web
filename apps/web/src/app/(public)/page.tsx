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
  alternates: {
    // `hreflang` for the languages the public site genuinely serves. There
    // is one URL per locale today -- the preference is stored rather than
    // routed -- so each tag points at the same page and `x-default` names
    // the English fallback.
    languages: {
      'en-IN': '/',
      'te-IN': '/',
      'hi-IN': '/',
      'en-US': '/',
      'es-US': '/',
      'x-default': '/',
    },
  },
};

export default function HomePage() {
  return <HomeContent />;
}
