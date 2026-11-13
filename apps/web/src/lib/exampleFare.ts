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
