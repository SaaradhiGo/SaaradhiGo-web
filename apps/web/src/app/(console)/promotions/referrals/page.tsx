'use client';

import { CampaignList } from '@/components/console/promotions/CampaignList';

/**
 * Promotions: referrals. Rider to rider and driver to driver. A reward is earned only after the
 * new person completes the trips the campaign names, and never across the same device, phone
 * number or payment instrument; a blocked reward goes to the fraud flags.
 */
export default function ReferralsPage() {
  return (
    <CampaignList kind="referral" audienceFilter newLabel="New referral campaign…"
      subtitle="Rewards for bringing in a new rider or driver, paid after they complete the trips you set. Matches on the same device, phone number or payment instrument are blocked and flagged."
      emptyDetail="No referral campaigns in your scope yet. Start one for riders or for drivers." />
  );
}
