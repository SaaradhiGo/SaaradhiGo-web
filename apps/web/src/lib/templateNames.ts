/**
 * Message templates by name, never by key (owner 24 Nov). An unknown key reads as words built from
 * the key ("payout.details_changed" -> "Payout details changed"); the key stays as small text.
 */
const NAMES: Record<string, string> = {
  'commission.increase_notice': 'Driver fee increase notice',
  'driver.approved': 'Driver approved',
  'driver.document_expiring': 'Driver document expiring',
  'kyc.review_past_target': 'KYC review overdue',
  'payout.cancelled': 'Payout cancelled', 'payout.details_changed': 'Payout details changed',
  'payout.failed': 'Payout failed', 'payout.initiated': 'Payout started', 'payout.missing_details': 'Payout details missing',
  'payout.pending': 'Payout pending', 'payout.processed': 'Payout paid', 'payout.queued': 'Payout queued',
  'payout.rejected': 'Payout rejected', 'payout.reversed': 'Payout reversed',
  'promotions.incentive_completed': 'Driver quest completed', 'promotions.incentive_progress': 'Driver quest progress',
  'promotions.promo_available': 'New promotion', 'promotions.referral_reward': 'Referral reward',
  'refund.failed': 'Refund failed', 'refund.processed': 'Refund paid',
  'trips.operator_cancelled': 'Trip cancelled by SaaradhiGo', 'trips.operator_ended_driver': 'Trip ended by SaaradhiGo (driver)',
  'trips.operator_ended_rider': 'Trip ended by SaaradhiGo (rider)', 'trips.pickup_code_reminder': 'Pickup code reminder',
  trip_receipt: 'Trip receipt',
};

const CHANNELS: Record<string, string> = { in_app: 'In the app', sms: 'SMS', email: 'Email', push: 'Push notification', whatsapp: 'WhatsApp' };

/** "Driver fee increase notice" for "commission.increase_notice". Pure; tested. */
export function templateName(key: string | null | undefined): string {
  if (!key) return '—';
  if (NAMES[key]) return NAMES[key];
  const words = key.split('.').slice(-2).join(' ').replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function channelName(key: string | null | undefined): string {
  return key ? CHANNELS[key] ?? key.replace(/_/g, ' ') : '—';
}

const PROVIDERS: Record<string, string> = {
  stub: 'Test sender', msg91: 'MSG91', twilio: 'Twilio', ses: 'Amazon SES', fcm: 'Firebase push',
  in_app: 'In-app inbox', aws_sns: 'Amazon SNS', stripe_connect: 'Stripe Connect', google_maps: 'Google Maps',
  razorpay: 'Razorpay', cashfree: 'Cashfree', stripe: 'Stripe', sns: 'Amazon SNS',
  s3_compatible: 'Cloudflare R2 storage', sentry: 'Sentry',
};

/** "Amazon SES" for "ses": a provider as a person would name it. */
export function providerName(key: string | null | undefined): string {
  return key ? PROVIDERS[key] ?? key.replace(/_/g, ' ') : '—';
}

/** "Rider platform fee" for "rider_platform_fee": a system key in sentence case, for labels. */
export function keyWords(key: string | null | undefined): string {
  if (!key) return '—';
  const w = key.replace(/[._]+/g, ' ').trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
}
