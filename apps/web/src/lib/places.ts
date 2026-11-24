/**
 * Places by name, never by code (owner 24 Nov). A code may appear only as small secondary text.
 * Names come from the places the operator holds; the few above them are named here.
 */
import { getCachedAccess, type AdminScope } from '@/lib/adminScope';

const KNOWN: Record<string, string> = {
  GLOBAL: 'All countries', IN: 'India', US: 'United States',
  'IN-TG': 'Telangana', 'IN-AP': 'Andhra Pradesh', 'US-ID': 'Idaho', 'US-TX': 'Texas',
};

/** "Hyderabad" for "IN-TG-HYD"; a state given as country + "TG" also works. Unknown: the code. Pure. */
export function placeName(code: string | null | undefined, scopes: AdminScope[] = getCachedAccess()?.scopes ?? []): string {
  if (!code) return 'Whole platform';
  const c = code.toUpperCase();
  return scopes.find((s) => s.code === c)?.name ?? KNOWN[c] ?? code;
}

/** "Telangana, India" from a country and a state code ("IN", "TG"); "All of India" with no state. */
export function marketName(country: string, stateCode?: string | null): string {
  const cn = placeName(country);
  return stateCode ? `${placeName(`${country}-${stateCode}`)}, ${cn}` : `All of ${cn}`;
}
