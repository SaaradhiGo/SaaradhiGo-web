'use client';

import { useEffect, useId, useState } from 'react';
import { Market, Markets, fetchMarkets } from '@/lib/markets';

/**
 * Country selector + national number, the pair every phone input needs.
 *
 * The country list comes from the server, so no dial code is written down in
 * this repository. While it loads, the field stays usable: the selector shows
 * a loading state rather than a wrong default, because preselecting India
 * before the answer arrives is the India-only assumption in miniature.
 */
export function usePhoneMarkets() {
  const [markets, setMarkets] = useState<Markets | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMarkets()
      .then((m) => alive && setMarkets(m))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  return { markets, failed };
}

export default function PhoneField({
  markets,
  failed,
  countryCode,
  onCountryChange,
  national,
  onNationalChange,
  error,
  help,
  autoFocus,
}: {
  markets: Markets | null;
  /** The country list could not be loaded. Fall back, do not hang. */
  failed?: boolean;
  countryCode: string;
  onCountryChange: (code: string) => void;
  national: string;
  onNationalChange: (value: string) => void;
  error?: string | null;
  help?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const countryId = `${id}-country`;
  const numberId = `${id}-number`;
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errorId : null, help ? helpId : null]
    .filter(Boolean)
    .join(' ');

  const list: Market[] = markets?.countries ?? [];
  const loading = markets === null && !failed;

  // If the country list cannot be loaded, a selector stuck on "Loading…"
  // is a dead end: the person cannot proceed and cannot see why. Ask for the
  // full international number instead, which the server normalises anyway.
  if (failed) {
    return (
      <div>
        <label htmlFor={numberId} className="label">
          Mobile number
        </label>
        <input
          id={numberId}
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+15550123456"
          value={national}
          onChange={(e) => onNationalChange(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          autoFocus={autoFocus}
          required
        />
        <p id={helpId} className="help">
          Include your country code, for example +15550123456.
        </p>
        {error && (
          <p id={errorId} className="field-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3">
        <div>
          <label htmlFor={countryId} className="label">
            Country
          </label>
          <select
            id={countryId}
            className="input"
            value={countryCode}
            onChange={(e) => onCountryChange(e.target.value)}
            disabled={loading || list.length === 0}
          >
            {loading && <option value="">Loading…</option>}
            {!loading && list.length === 0 && (
              <option value="">Unavailable</option>
            )}
            {list.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name} +{m.calling_code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={numberId} className="label">
            Mobile number
          </label>
          <input
            id={numberId}
            className="input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={national}
            onChange={(e) => onNationalChange(e.target.value)}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy || undefined}
            autoFocus={autoFocus}
            required
          />
        </div>
      </div>

      {help && (
        <p id={helpId} className="help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
