/**
 * The example on the public request mock-ups (owner, 13 Nov: numbers, never grey bars).
 *
 * From QA's live Hyderabad rate card and commission rule (13 Nov): a Sedan trip of ₹183.00
 * (QA trip 207's receipt: base 60.00 + distance and time 122.59 + rounding 0.41) at the
 * Hyderabad commission of 15%. Marked "Example" wherever it is shown. Minor units, so the
 * three lines add up exactly (exampleFare.test.ts).
 */
export const EXAMPLE_FARE = {
  city: 'Hyderabad',
  vehicle: 'Sedan',
  currency: 'INR',
  fareMinor: 18300,
  commissionPercent: 15,
} as const;

export function exampleSplit() {
  const fare = EXAMPLE_FARE.fareMinor;
  const commission = Math.round((fare * EXAMPLE_FARE.commissionPercent) / 100);
  return { fare, commission, earn: fare - commission };
}

export function rupees(minor: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(minor / 100);
}

/**
 * 14 Nov (owner): public content follows the visitor's market. The USA example is from QA's
 * Treasure Valley TEST rate card and commission rule (14 Nov): a Standard trip from Boise State
 * University to The Village at Meridian, 10.3 mi and 19 min, quoted at $26.14 (base 2.50 +
 * distance 16.48 + time 5.66 + the city's flat fee), at the Treasure Valley commission of 15%.
 */
export const EXAMPLE_FARE_US = {
  city: 'Treasure Valley',
  vehicle: 'Standard',
  currency: 'USD',
  fareMinor: 2614,
  commissionPercent: 15,
} as const;

export type ExampleFare = { city: string; vehicle: string; currency: string; fareMinor: number; commissionPercent: number };

export function exampleFor(market: string | null | undefined): ExampleFare {
  return market === 'US' ? EXAMPLE_FARE_US : EXAMPLE_FARE;
}

export function splitOf(ex: ExampleFare) {
  const commission = Math.round((ex.fareMinor * ex.commissionPercent) / 100);
  return { fare: ex.fareMinor, commission, earn: ex.fareMinor - commission };
}

/** The amount in the example's own currency. */
export function moneyOf(minor: number, currency: string) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(minor / 100);
}

/** The vehicle classes on the home page's phone: what the market's cities offer (no Auto in the USA). */
export function mockClassesFor(market: string | null | undefined, india: string[]): string[] {
  return market === 'US' ? ['Standard', 'XL'] : india;
}
