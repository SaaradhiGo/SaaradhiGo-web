/**
 * Feature flags for the public site, read at build time.
 *
 * scheduledRides (off): the "Ride now / Schedule" switch on the home booking
 *   panel. Scheduled rides do not exist in the backend, so the switch stays
 *   hidden until they do (owner, 2026-11-07). NEXT_PUBLIC_FLAG_SCHEDULED_RIDES=on
 *   brings it back.
 *
 * translationReviewNotice (on): the "Translation under review." line under
 *   the header on Telugu, Hindi and Spanish pages, until the owner confirms
 *   the native-speaker review. NEXT_PUBLIC_FLAG_TRANSLATION_REVIEW_NOTICE=off
 *   removes it.
 */
export const SITE_FLAGS = {
  scheduledRides: process.env.NEXT_PUBLIC_FLAG_SCHEDULED_RIDES === 'on',
  translationReviewNotice: process.env.NEXT_PUBLIC_FLAG_TRANSLATION_REVIEW_NOTICE !== 'off',
} as const;
