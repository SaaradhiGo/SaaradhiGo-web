'use client';

import { CampaignList } from '@/components/console/promotions/CampaignList';

/**
 * Promotions: rider promos. A discount code (or one applied automatically) with a budget that is a
 * hard cap. The platform pays the discount; the driver's earnings and commission stay on the full
 * fare. Going live, and raising a budget, need a second admin.
 */
export default function RiderPromosPage() {
  return (
    <CampaignList kind="rider_promo" newLabel="New rider promo…"
      subtitle="Discount codes for riders. The platform pays the discount, never the driver. A budget is a hard cap, and going live needs a second admin."
      emptyDetail="No rider promos in your scope yet. Start one: a code or an automatic discount, with a budget." />
  );
}
