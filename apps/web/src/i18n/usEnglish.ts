/**
 * US English for US riders and drivers (owner, 14 Nov). India keeps UK English.
 *
 * The copy is written once, in UK English. When the language is English and the market on screen
 * is the USA, what is SHOWN is respelled here: License, canceled, color, center, and the rest.
 * It runs on display text only (the output of `tr`, `useSite`, `usePages`), never on data or
 * codes, so a trip status `cancelled` or a field called `colour` is untouched.
 *
 * Whole words only, and the case is kept: "Licence" -> "License", "LICENCE" -> "LICENSE".
 */

/** UK word -> US word. Every form listed: nothing is guessed from a suffix. */
const WORDS: Record<string, string> = {
  licence: 'license', licences: 'licenses', licenced: 'licensed',
  cancelled: 'canceled', cancelling: 'canceling',
  colour: 'color', colours: 'colors', coloured: 'colored',
  centre: 'center', centres: 'centers', centred: 'centered',
  labelled: 'labeled', labelling: 'labeling',
  catalogue: 'catalog', catalogues: 'catalogs',
  honour: 'honor', honours: 'honors', honoured: 'honored', honouring: 'honoring',
  favour: 'favor', favours: 'favors', favourite: 'favorite', favourites: 'favorites',
  behaviour: 'behavior', behaviours: 'behaviors',
  neighbour: 'neighbor', neighbours: 'neighbors', neighbourhood: 'neighborhood', neighbourhoods: 'neighborhoods',
  grey: 'gray',
  fulfil: 'fulfill', fulfils: 'fulfills', fulfilment: 'fulfillment',
  enrol: 'enroll', enrols: 'enrolls', enrolment: 'enrollment',
  travelled: 'traveled', travelling: 'traveling', traveller: 'traveler', travellers: 'travelers',
  kerb: 'curb', kerbside: 'curbside', tyre: 'tire', tyres: 'tires',
  programme: 'program', programmes: 'programs',
  kilometre: 'kilometer', kilometres: 'kilometers', metre: 'meter', metres: 'meters',
  defence: 'defense', offence: 'offense', offences: 'offenses',
  enquiry: 'inquiry', enquiries: 'inquiries',
  cheque: 'check', cheques: 'checks',
  analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing',
  practise: 'practice',
};

/** -ise verbs: every form of each stem ("authoris" -> authorise, authorised, authorisation...). */
const ISE_STEMS = [
  'authoris', 'recognis', 'organis', 'apologis', 'realis', 'customis', 'personalis', 'prioritis',
  'summaris', 'finalis', 'minimis', 'maximis', 'optimis', 'utilis', 'itemis', 'emphasis',
  'standardis', 'visualis', 'categoris', 'memoris', 'specialis', 'capitalis', 'normalis',
];
for (const stem of ISE_STEMS) {
  const us = `${stem.slice(0, -1)}z`;
  for (const end of ['e', 'ed', 'es', 'ing', 'ation', 'ations']) WORDS[stem + end] = us + end;
}

const PATTERN = new RegExp(`\\b(${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');

function keepCase(original: string, us: string): string {
  if (original === original.toUpperCase()) return us.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return us[0].toUpperCase() + us.slice(1);
  return us;
}

/** The text respelled in US English. */
export function usEnglish(text: string): string {
  if (!text) return text;
  return text.replace(PATTERN, (m) => keepCase(m, WORDS[m.toLowerCase()] ?? m));
}

const memo = new WeakMap<object, unknown>();

/** Every string in a copy object (useSite, usePages) respelled; the same object back each time. */
export function usEnglishDeep<T>(copy: T): T {
  if (typeof copy === 'string') return usEnglish(copy) as T;
  if (!copy || typeof copy !== 'object') return copy;
  const hit = memo.get(copy as object);
  if (hit) return hit as T;
  const out = Array.isArray(copy)
    ? copy.map((v) => usEnglishDeep(v))
    : Object.fromEntries(Object.entries(copy as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'function' ? v : usEnglishDeep(v)]));
  memo.set(copy as object, out);
  return out as T;
}
