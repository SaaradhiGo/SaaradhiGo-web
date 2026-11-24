import { redirect } from 'next/navigation';

/** 24 Nov (owner): no separate Commission page. Commission is one of the fee-plan types. */
export default function PricingIndex() {
  redirect('/ops/pricing/fee-plans');
}
