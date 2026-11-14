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

/**
 * A place suggestion as two lines (14 Nov): the name ("Cyber Towers") and where it is, without
 * state, PIN or country ("HITEC City, Hyderabad"); and the short text the field shows once chosen
 * ("Cyber Towers, HITEC City").
 */
export function suggestionLines(p: { description: string; structured_formatting?: { main_text?: string; secondary_text?: string } }): {
  name: string; area: string; short: string;
} {
  const main = p.structured_formatting?.main_text?.trim();
  const rest = p.structured_formatting?.secondary_text?.trim();
  const name = main || p.description.split(/[,]| - /)[0].trim();
  let areaParts = (rest ?? p.description.split(',').slice(1).join(',')).split(',').map((x) => x.trim()).filter(Boolean);
  while (areaParts.length > 1 && isRegion(areaParts[areaParts.length - 1])) areaParts.pop();
  if (areaParts.length === 1 && isRegion(areaParts[0])) areaParts = [];
  areaParts = areaParts.filter((x) => x.toLowerCase() !== name.toLowerCase());
  const area = areaParts.slice(0, 2).join(', ');
  const short = (areaParts[0] ? `${name}, ${areaParts[0]}` : name).slice(0, 80);
  return { name, area, short };
}
