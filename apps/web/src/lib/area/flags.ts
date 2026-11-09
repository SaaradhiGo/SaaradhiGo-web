/**
 * Signed-in features whose data does not exist yet (owner, 2026-11-08: hide
 * them behind a flag, off, and list what each needs). Each turns on with its
 * NEXT_PUBLIC_FLAG_* variable once the backend has it.
 */
const on = (v: string | undefined) => v === 'on';

export const AREA_FLAGS = {
  /** Account > Safety: trusted contacts and the auto-share switch (/sharing/, 9 Nov). */
  trustedContacts: on(process.env.NEXT_PUBLIC_FLAG_TRUSTED_CONTACTS),
  /** Share every trip automatically: needs trusted contacts. */
  autoShare: on(process.env.NEXT_PUBLIC_FLAG_AUTO_SHARE),
  /** Share = the trip's live link (/t/<token>) with Stop sharing, instead of a text summary. */
  shareLink: on(process.env.NEXT_PUBLIC_FLAG_SHARE_LINK),
  /** Trip updates by SMS: only a global sms_enabled preference exists. */
  tripSms: on(process.env.NEXT_PUBLIC_FLAG_TRIP_SMS),
  /** Arrival times on the trip screen (GET /ride/trip/<id>/eta/ and trip_eta_update, 9 Nov). */
  pickupEta: on(process.env.NEXT_PUBLIC_FLAG_PICKUP_ETA),
  /** Calling the driver through the masked call bridge (/calls/, 9 Nov). */
  callDriver: on(process.env.NEXT_PUBLIC_FLAG_CALL_DRIVER),
  /** Withdraw from the web: a money flow, not built tonight. */
  withdraw: on(process.env.NEXT_PUBLIC_FLAG_WITHDRAW),
  /** Tips: none exist (owner ruling D5). */
  tips: on(process.env.NEXT_PUBLIC_FLAG_TIPS),
} as const;
