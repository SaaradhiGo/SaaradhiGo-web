// Which markets this deployment serves, read from the backend.
//
// WHY NOT A CONSTANT IN THIS FILE
// `base/countries.py` is already the single source of truth for calling
// codes, currencies, units and valid national number lengths. Re-declaring
// any of it here would be a second definition to drift against the one the
// server prices and normalises with -- and hardcoding one dial code is
// exactly how `+91` ended up in a sign-up form on a platform meant to run in
// more than one country.
//
// So this reads `GET /pricing/countries/` and nothing here knows what a
// country is until the server says.

import { api } from './api';

export type Market = {
  code: string;
  name: string;
  calling_code: string;
  currency: string;
  currency_symbol: string;
  symbol_position: 'prefix' | 'suffix';
  distance_unit: 'km' | 'mi';
  national_number_lengths: number[];
};

export type Markets = {
  countries: Market[];
  default_country: string;
};

export async function fetchMarkets(): Promise<Markets> {
  return api.get<Markets>('/pricing/countries/');
}

/** A service area the platform actually operates in. */
export type Zone = {
  code: string;
  name: string;
  city?: string;
  country: string;
  currency: string;
  timezone?: string;
};

export async function fetchZones(): Promise<Zone[]> {
  const data = await api.get<{ zones?: Zone[] }>('/pricing/zones/');
  return data?.zones ?? [];
}

/**
 * Build an E.164 number from a market and what the person typed.
 *
 * The server normalises properly; this only has to stop an obviously wrong
 * value being sent, and must not assume a length -- India's national numbers
 * are 10 digits and other markets differ, which is why the registry carries
 * `national_number_lengths` per country.
 */
export function toE164(market: Market | undefined, national: string): string {
  const digits = (national || '').replace(/\D/g, '');
  if (!market) return digits ? `+${digits}` : '';
  return `+${market.calling_code}${digits}`;
}

export function nationalLooksValid(
  market: Market | undefined,
  national: string,
): boolean {
  const digits = (national || '').replace(/\D/g, '');
  if (!digits) return false;
  if (!market || market.national_number_lengths.length === 0) {
    return digits.length >= 6 && digits.length <= 15;
  }
  return market.national_number_lengths.includes(digits.length);
}

/** Money in the market's own currency, placed on the correct side. */
export function formatMoney(amount: number, market?: Market): string {
  const n = amount.toFixed(2);
  if (!market) return n;
  return market.symbol_position === 'suffix'
    ? `${n}${market.currency_symbol}`
    : `${market.currency_symbol}${n}`;
}
