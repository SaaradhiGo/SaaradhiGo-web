/**
 * The public support address.
 *
 * CONFIGURABLE, AND FOR A REASON. `saaradhigo.in` publishes no MX record
 * today, which means mail sent to any address at that domain has nowhere to
 * be delivered. The address below is the one the backend's contact domain
 * implies and is kept as the default so the contact page is not left without
 * a route to a person, but it has to be either made deliverable (publish MX
 * for the domain) or replaced through this variable before the site is
 * public. Recorded as an owner action rather than quietly swapped for an
 * address nobody agreed to.
 */
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@saaradhigo.in';

/** A prefilled subject saves support a round trip identifying the request. */
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  'SaaradhiGo support request',
)}`;
