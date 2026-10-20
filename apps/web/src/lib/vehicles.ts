/**
 * What to call a vehicle class in front of a rider.
 *
 * The server's categories are lowercase codes -- `bike`, `auto`, `sedan`,
 * `suv` -- and the design system names them "Saaradhi <Class>". Capitalising
 * the first letter got that right three times out of four and produced
 * "Saaradhi Suv", which is the kind of detail a premium page cannot have.
 *
 * ACRONYMS ARE LISTED, NOT GUESSED. There is no rule that separates "suv"
 * from "sedan" by shape, so the few that are initialisms are named here and
 * everything else is title-cased. An unknown code still comes out readable,
 * which matters because this list is in the client and the categories are in
 * the server's rate cards: a new class must not need a web deploy to stop
 * looking broken.
 */
const ACRONYMS: Record<string, string> = {
  suv: 'SUV',
  xl: 'XL',
};

/** "sedan" -> "Sedan"; "suv" -> "SUV". The class on its own. */
export function vehicleClassLabel(type: string): string {
  const key = type.trim().toLowerCase();
  if (!key) return '';
  if (ACRONYMS[key]) return ACRONYMS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** "sedan" -> "Saaradhi Sedan". The full product name. */
export function vehicleProductName(type: string): string {
  const label = vehicleClassLabel(type);
  return label ? `Saaradhi ${label}` : 'Saaradhi';
}
