/**
 * The public support address, and the site's own origin.
 *
 * THE DOMAIN IS saaradhigo.com. An earlier version of this file defaulted to
 * `support@saaradhigo.in` and carried a warning that the domain published no
 * MX record, so the address could not receive mail. That was true of the
 * `.in` domain and is not true of `.com`: it publishes Zoho MX
 * (mx.zoho.com, mx2, mx3), an SPF record and a DMARC policy. Mail to this
 * domain is deliverable.
 *
 * What is still worth confirming is the MAILBOX, not the domain: Zoho
 * requires `support@` to be created and assigned before it accepts mail for
 * it. That is an owner action, and the variable below is how to point the
 * site somewhere else in the meantime without a code change.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@saaradhigo.com';

/** A prefilled subject saves support a round trip identifying the request. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'SaaradhiGo support request',
)}`;

/**
 * Where this deployment is served from, for canonical URLs, Open Graph and
 * the sitemap.
 *
 * It has to be absolute and it has to be the PUBLIC origin, not the Railway
 * hostname a QA deployment answers on -- a canonical tag pointing at
 * `web-qa-800c.up.railway.app` invites search engines to index QA as the
 * real site. QA sets this variable to its own origin so its metadata is
 * self-consistent and its robots file can keep crawlers out entirely.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://saaradhigo.com'
).replace(/\/$/, '');

/**
 * True when this deployment is the real public site.
 *
 * QA must not be indexed, and nothing should link a rider from QA to
 * production or the other way round.
 */
export const IS_PUBLIC_SITE = SITE_URL === 'https://saaradhigo.com';
