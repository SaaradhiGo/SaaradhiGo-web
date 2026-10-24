/**
 * Sample artwork for the two photography slots.
 *
 * WHAT THIS IS AND IS NOT. It is brand line-art standing in for a
 * photograph so the page can be judged as a composition instead of around
 * two grey rectangles. It is NOT a photograph, is not dressed up as one, and
 * carries a visible "sample" label so nobody mistakes it for finished work.
 *
 * WHY NOT A REAL PHOTO. The slot wants a licensed photograph of an Indian
 * urban street scene. None was supplied: the design handoff is logos and app
 * icons, the design PDF is a vector mockup with zero embedded images, and
 * the repository has none. Stock libraries are reachable but searchable only
 * with an API key, so picking a file would mean guessing an identifier
 * without seeing what it depicts -- which is how the wrong image ships on a
 * homepage.
 *
 * Replacing it is a one-line change: put the file in `public/photography/`
 * and pass `src` to `ImageSlot`. The box, aspect ratio and crop are already
 * what the photograph will use, so nothing moves.
 */

/** A city street at dusk: skyline, road, and a car waiting at the kerb. */
export function CityArt({ label }: { label: string }) {
  return (
    <div className="hp-art">
      <svg viewBox="0 0 400 300" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
        {/* Sky and ground are flat token fills: the design system allows no
            gradients outside map scrims. */}
        <rect width="400" height="300" fill="var(--bg-100)" />
        <rect y="210" width="400" height="90" fill="var(--bg-200)" />

        {/* Skyline, back to front, in two depths so it reads as a city. */}
        <g fill="var(--bg-300)">
          <rect x="18" y="96" width="38" height="116" />
          <rect x="64" y="124" width="30" height="88" />
          <rect x="300" y="110" width="34" height="102" />
          <rect x="342" y="138" width="40" height="74" />
        </g>
        <g fill="var(--bg-200)" stroke="var(--line)">
          <rect x="104" y="70" width="46" height="142" />
          <rect x="158" y="104" width="34" height="108" />
          <rect x="248" y="86" width="44" height="126" />
        </g>

        {/* Lit windows, the one warm note in the skyline. */}
        <g fill="var(--gold-500)" opacity="0.5">
          <rect x="114" y="84" width="7" height="9" />
          <rect x="128" y="84" width="7" height="9" />
          <rect x="114" y="104" width="7" height="9" />
          <rect x="135" y="122" width="7" height="9" />
          <rect x="258" y="100" width="7" height="9" />
          <rect x="272" y="118" width="7" height="9" />
          <rect x="258" y="140" width="7" height="9" />
        </g>

        {/* The road, with a dashed centre line. */}
        <rect y="248" width="400" height="2" fill="var(--line-strong)" opacity="0.5" />
        <g stroke="var(--gold-500)" strokeWidth="3" strokeDasharray="18 16" opacity="0.6">
          <line x1="0" y1="276" x2="400" y2="276" />
        </g>

        {/* A saloon at the kerb, drawn as the vehicle glyphs are drawn. */}
        <g
          transform="translate(132 196)"
          fill="none"
          stroke="var(--gold-500)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M4 40V26l10-18c1.7-3 4-4 7-4h44c3 0 5.3 1 7 4l10 18v14z" />
          <path d="M14 26h68" />
          <circle cx="22" cy="42" r="7" />
          <circle cx="74" cy="42" r="7" />
        </g>

      </svg>
      <span className="hp-art__tag">{label}</span>
    </div>
  );
}

/** A driver beside their vehicle, for the Drive section. */
export function DriverArt({ label }: { label: string }) {
  return (
    <div className="hp-art">
      <svg viewBox="0 0 400 267" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
        <rect width="400" height="267" fill="var(--bg-100)" />
        <rect y="196" width="400" height="71" fill="var(--bg-200)" />
        <rect y="196" width="400" height="2" fill="var(--line)" />

        {/* The vehicle, three-quarters across, with the driver in front. */}
        <g
          transform="translate(132 104)"
          fill="none"
          stroke="var(--gold-500)"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M6 66V44l16-29c2.7-4.9 6.5-6.7 11.4-6.7h71.2c4.9 0 8.7 1.8 11.4 6.7l16 29v22z" />
          <path d="M22 44h110" />
          <circle cx="35" cy="70" r="11" />
          <circle cx="119" cy="70" r="11" />
        </g>

        <g stroke="var(--gold-500)" strokeWidth="3" strokeDasharray="18 16" opacity="0.5">
          <line x1="0" y1="232" x2="400" y2="232" />
        </g>

        {/* A horizon line of distant buildings, kept very quiet. */}
        <g fill="var(--bg-300)" opacity="0.8">
          <rect x="20" y="150" width="26" height="46" />
          <rect x="52" y="166" width="20" height="30" />
          <rect x="330" y="158" width="24" height="38" />
          <rect x="360" y="172" width="22" height="24" />
        </g>
      </svg>
      <span className="hp-art__tag">{label}</span>
    </div>
  );
}
