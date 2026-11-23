import type { AdminAccess } from '@/lib/adminScope';
import { vehicleClassLabel } from '@/lib/vehicles';

/**
 * Plain words for pricing pages (owner, 22 Nov): the class names riders and drivers see (Mini,
 * Sedan, SUV), "All classes" for a plan that covers every class, and city names, never keys such
 * as "hatchback", "*" or "IN-TG-HYD".
 */
const RIDER_NAMES: Record<string, string> = { hatchback: 'Mini', mini: 'Mini', suv: 'SUV', xl: 'XL', auto: 'Auto', bike: 'Bike' };

export function classWord(key: string): string {
  const k = (key || '').trim().toLowerCase();
  if (!k || k === '*') return 'All classes';
  return RIDER_NAMES[k] ?? vehicleClassLabel(k);
}

/** A place's name from its code, from the places this operator can see; the code only as a last resort. */
export function placeWord(code: string | null | undefined, access: AdminAccess | null, countryName?: string): string {
  if (!code) return countryName ? `All of ${countryName}` : 'Whole country';
  const hit = access?.scopes?.find((s) => s.code === code);
  return hit?.name ?? code;
}
