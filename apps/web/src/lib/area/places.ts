/**
 * Short place labels for lists and cards (13 Nov): the place name plus its area, e.g.
 * "Charminar, Ghansi Bazaar". The server stores one on each trip (`pickup_label`,
 * `destination_label`, servers/ride/places.py); a trip from before that, or an older server, falls
 * back to the same rule here. The full address is shown only in the trip detail.
 */
const COUNTRIES = new Set(['india', 'usa', 'united states', 'united states of america', 'us']);
const STATES = new Set([
  'andhra pradesh', 'telangana', 'karnataka', 'tamil nadu', 'kerala', 'maharashtra', 'delhi',
  'gujarat', 'rajasthan', 'west bengal', 'uttar pradesh', 'odisha', 'goa', 'punjab', 'haryana',
]);

function isRegion(part: string) {
  const p = part.toLowerCase().trim();
  return COUNTRIES.has(p) || STATES.has(p)
    || /^([a-z .]+ )?\d{5,6}(-\d{4})?$/.test(p) || /^[a-z]{2} \d{5}(-\d{4})?$/.test(p);
}

export function shortPlace(address: string | null | undefined): string {
  const parts = (address ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '';
  while (parts.length > 1 && isRegion(parts[parts.length - 1])) parts.pop();
  const name = parts[0];
  const area = parts.length >= 3 ? parts[parts.length - 2] : parts.length === 2 ? parts[1] : '';
  return (area && area.toLowerCase() !== name.toLowerCase() ? `${name}, ${area}` : name).slice(0, 80);
}

/** The stored label, else the rule applied to the address. */
export function placeLabel(label: string | null | undefined, address: string | null | undefined): string {
  return (label ?? '').trim() || shortPlace(address);
}
