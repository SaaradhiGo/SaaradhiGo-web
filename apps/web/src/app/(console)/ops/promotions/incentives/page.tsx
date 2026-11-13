'use client';

import { CampaignList } from '@/components/console/promotions/CampaignList';

/**
 * Promotions: driver incentives. A quest of N trips with a fixed reward, optionally for one zone,
 * hours or vehicle class. Paid in the weekly payout as its own line, with no commission.
 */
export default function IncentivesPage() {
  return (
    <CampaignList kind="driver_incentive" newLabel="New driver incentive…"
      subtitle="Quests for drivers: complete N trips, earn a fixed reward. Paid in the weekly payout as its own line, with no commission. A budget is a hard cap."
      emptyDetail="No driver incentives in your scope yet. Start one: a trip target, a reward and a budget." />
  );
}
