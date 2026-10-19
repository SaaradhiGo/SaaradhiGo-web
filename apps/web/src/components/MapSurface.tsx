'use client';

/**
 * Where the map goes.
 *
 * THIS COMPONENT WILL NOT DRAW A FAKE MAP.
 *
 * A real interactive map needs a configured tile provider. When there is
 * none, the honest thing is to say the map is unavailable -- not to render
 * decorative streets, a blurred screenshot, or a grid that a customer could
 * reasonably read as "this is where I am". A ride-hailing product that draws
 * an imaginary map has told the customer exactly how much to trust the
 * driver's position later.
 *
 * So: a faint neutral grid that is obviously a placeholder surface, a plain
 * statement of what is missing, and -- when the server has resolved a pickup
 * -- the real city, currency and vehicle count beneath it. Those come from
 * `/pricing/vehicle-types/`, not from here.
 *
 * When a provider IS configured, this is the component to render the map
 * into; the contract (`ready`) is already here so the page does not need to
 * change shape when that day comes.
 */
export default function MapSurface({
  ready = false,
  zoneName,
  currency,
  vehicleCount,
  className = '',
}: {
  /** True once a tile provider is configured and a map can really be drawn. */
  ready?: boolean;
  zoneName?: string | null;
  currency?: string | null;
  vehicleCount?: number | null;
  className?: string;
}) {
  return (
    <div className={`map-surface ${className}`}>
      <div className="absolute inset-0 grid place-items-center p-8 text-center">
        {ready ? null : (
          <div className="max-w-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mx-auto h-9 w-9 text-white/25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8 9 4.5Z" />
              <path d="M9 4.5v12.7M15 6.8v12.7" />
            </svg>
            <p className="mt-4 text-sm font-medium text-white/70">
              Live map unavailable
            </p>
            <p className="mt-1.5 text-sm text-white/45">
              No map provider is configured for this deployment, so we are not
              showing one. Booking, fares and trip tracking are unaffected.
            </p>
          </div>
        )}
      </div>

      {zoneName && (
        <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.07] bg-ink-900/85 px-5 py-3.5 backdrop-blur">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 rounded-full bg-emerald-400"
            />
            <strong className="font-semibold">{zoneName}</strong>
            {currency && <span className="text-white/55">fares in {currency}</span>}
            {typeof vehicleCount === 'number' && (
              <span className="text-white/55">
                {vehicleCount} {vehicleCount === 1 ? 'vehicle type' : 'vehicle types'}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
