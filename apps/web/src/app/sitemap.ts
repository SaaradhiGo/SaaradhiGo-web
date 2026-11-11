import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/support';

/**
 * The public pages, and only those.
 *
 * `/book` is deliberately absent: it is a workspace, not a document, and its
 * useful states all live behind a sign-in. Listing it would offer searchers
 * a page that asks them to log in, which is a worse first result than the
 * page that explains how booking works -- which is `/ride`, and is listed.
 *
 * No `lastModified` guesses. A date invented at build time tells a crawler
 * the content changed when it did not; leaving it out says nothing false.
 */
const PAGES = ['', '/ride', '/drive', '/safety', '/about', '/help', '/contact', '/privacy', '/terms'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.7,
  }));
}
