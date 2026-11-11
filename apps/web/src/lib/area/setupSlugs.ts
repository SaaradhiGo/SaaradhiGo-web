/**
 * The setup steps' addresses (/driver/setup/<slug>), readable on the server as well as in the
 * browser. An address a driver might type or follow from older links (11 Nov: /driver/setup/licence)
 * opens its step; anything else opens the setup start, never step 1 silently.
 */
export type StepKey = 'personal' | 'contact' | 'identity' | 'vehicle' | 'vehicle_docs' | 'payouts';

export const STEP_SLUG: Record<StepKey, string> = {
  personal: 'personal', contact: 'contact', identity: 'identity', vehicle: 'vehicle', vehicle_docs: 'photos-and-papers', payouts: 'payouts',
};

const ALIASES: Record<string, string> = {
  licence: 'identity', license: 'identity', 'licence-and-identity': 'identity', documents: 'photos-and-papers',
  photos: 'photos-and-papers', papers: 'photos-and-papers', 'vehicle-docs': 'photos-and-papers', bank: 'payouts',
  'emergency-contact': 'contact', profile: 'personal',
};

/** `{ slug }` when the address is a step, `{ redirect }` when it is a known alias or unknown. */
export function resolveSlug(slug: string): { slug: string } | { redirect: string } {
  if ((Object.values(STEP_SLUG) as string[]).includes(slug)) return { slug };
  const alias = ALIASES[slug.toLowerCase()];
  return { redirect: alias ? `/driver/setup/${alias}` : '/driver/setup' };
}
