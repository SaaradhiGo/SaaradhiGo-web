import type { MetadataRoute } from 'next';
import { IS_PUBLIC_SITE, SITE_URL } from '@/lib/support';

/**
 * QA IS NOT INDEXABLE. ANYTHING ELSE WOULD BE A SECOND SAARADHIGO.
 *
 * The QA deployment is a complete, working copy of the public site on a
 * different hostname. Left crawlable it competes with the real site for its
 * own brand terms, and riders find a booking page wired to a test database.
 * So only the deployment whose `NEXT_PUBLIC_SITE_URL` is the public origin
 * allows crawling; every other one disallows everything.
 *
 * The console and the account area are disallowed on the public site too:
 * they are either internal or private to a signed-in rider, and neither has
 * anything a search result should lead to.
 */
export default function robots(): MetadataRoute.Robots {
  if (!IS_PUBLIC_SITE) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/book', '/my-trips', '/login', '/verify-email', '/reset-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
