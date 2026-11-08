/**
 * Signed-in features whose data does not exist yet (owner, 2026-11-08: hide
 * them behind a flag, off, and list what each needs). Each turns on with its
 * NEXT_PUBLIC_FLAG_* variable once the backend has it.
 */
const on = (v: string | undefined) => v === 'on';

export const AREA_FLAGS = {
  /** Trusted contacts: no model or endpoint. */
  trustedContacts: on(process.env.NEXT_PUBLIC_FLAG_TRUSTED_CONTACTS),
  /** Share every trip automatically: needs trusted contacts. */
  autoShare: on(process.env.NEXT_PUBLIC_FLAG_AUTO_SHARE),
  /** Trip updates by SMS: only a global sms_enabled preference exists. */
  tripSms: on(process.env.NEXT_PUBLIC_FLAG_TRIP_SMS),
  /** Minutes until the driver arrives: no ETA field on the trip. */
  pickupEta: on(process.env.NEXT_PUBLIC_FLAG_PICKUP_ETA),
  /** Calling the driver: contacts stay masked (earlier ruling). */
  callDriver: on(process.env.NEXT_PUBLIC_FLAG_CALL_DRIVER),
  /** Withdraw from the web: a money flow, not built tonight. */
  withdraw: on(process.env.NEXT_PUBLIC_FLAG_WITHDRAW),
  /** Tips: none exist (owner ruling D5). */
  tips: on(process.env.NEXT_PUBLIC_FLAG_TIPS),
} as const;
