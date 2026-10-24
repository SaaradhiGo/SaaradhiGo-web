/**
 * What to call a vehicle class in front of a rider.
 *
 * THE BACKEND IDENTIFIER NEVER CHANGES. The pricing service, dispatch and
 * the trip record all key on `auto`, `hatchback`, `sedan`, `suv`, and those
 * strings are not touched here -- renaming an enum to change a label is how
 * a public rename quietly breaks fare lookup. This module is display only.
 *
 * `hatchback` is shown as "Mini", which is what that class is called to
 * riders in this market. The mapping lives in one place so the next person
 * looking for "why does the site say Mini" finds it immediately.
 *
 * The "Saaradhi" prefix is gone: the brand is in the logo, the nav and the
 * footer, and repeating it on four cards made the names longer without
 * making them clearer.
 */

/** Display keys the dictionaries carry a name and a blurb for. */
export type RideKey = 'auto' | 'mini' | 'sedan' | 'suv';

/**
 * Backend category code -> display key.
 *
 * A code with no entry has no translated name, which is deliberate: the
 * caller falls back to the server's own string rather than this file
 * inventing a label for a class it has never heard of.
 */
const DISPLAY_KEY: Record<string, RideKey> = {
  auto: 'auto',
  hatchback: 'mini',
  mini: 'mini',
  sedan: 'sedan',
  suv: 'suv',
};

/** The display key for a backend code, or null when there is none. */
export function rideBlurbKey(type: string): RideKey | null {
  return DISPLAY_KEY[type.trim().toLowerCase()] ?? null;
}

/**
 * The public name for a backend category.
 *
 * Falls back to a tidied version of the server's own code, so a newly added
 * class renders readably instead of disappearing or showing a placeholder.
 */
export function publicRideName(type: string, names: Record<RideKey, string>): string {
  const key = rideBlurbKey(type);
  if (key) return names[key];
  const raw = type.trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * The class on its own, for screens that still want the plain label.
 *
 * Kept because the booking page uses it in "Confirm Sedan · ₹248", where the
 * category is part of a sentence rather than a card title.
 */
const ACRONYMS: Record<string, string> = { suv: 'SUV', xl: 'XL' };

export function vehicleClassLabel(type: string): string {
  const key = type.trim().toLowerCase();
  if (!key) return '';
  if (ACRONYMS[key]) return ACRONYMS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}
