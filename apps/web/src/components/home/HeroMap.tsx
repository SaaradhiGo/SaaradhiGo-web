/**
 * Decorative map for the hero, in the design's map style. Static: no
 * ETAs, no cars, no fares -- nothing here claims to be live.
 */
export function HeroMap({ pickup, drop }: { pickup: string; drop: string }) {
  const route = 'M190 410 C250 372 300 352 332 292 C364 232 420 196 474 132';
  return (
    // Paths stay inside the viewBox: anything past it measures wider than a phone.
    <div className="sg-map hp-map" aria-hidden="true">
      <svg viewBox="0 0 640 560" preserveAspectRatio="xMidYMid slice" focusable="false">
        <rect className="m-ground" width="640" height="560" />
        <rect className="m-park" x="70" y="120" width="96" height="70" rx="14" />
        <rect className="m-park" x="470" y="330" width="90" height="80" rx="14" />
        <path
          className="m-street"
          transform="rotate(-8 320 280)"
          style={{ strokeWidth: 3 }}
          d="M30 0V560M100 0V560M170 0V560M240 0V560M310 0V560M380 0V560M450 0V560M520 0V560M590 0V560M0 20H640M0 80H640M0 140H640M0 200H640M0 260H640M0 320H640M0 380H640M0 440H640M0 500H640"
        />
        <path
          className="m-water"
          d="M300 400 C330 380 380 392 410 420 C440 450 430 490 390 500 C350 510 300 490 290 450 C284 428 288 410 300 400Z"
        />
        <path
          className="m-arterial"
          style={{ strokeWidth: 7 }}
          d="M0 200 C120 190 260 215 400 200 C500 190 580 200 640 196M0 440 C140 430 280 470 420 450 C520 436 600 430 640 436M140 0 C150 150 130 330 150 560M440 0 C430 160 450 340 430 560"
        />
        <path className="m-highway" style={{ strokeWidth: 11 }} d="M0 500 Q 280 200 640 10" />
        <text className="m-label" x="470" y="262" style={{ fontSize: 10 }}>KONDAPUR</text>
        <text className="m-label" x="40" y="330" style={{ fontSize: 10 }}>GACHIBOWLI</text>
        <text className="m-label" x="410" y="536" style={{ fontSize: 10 }}>MADHAPUR</text>
        <path className="route-glow" d={route} />
        <path className="route" d={route} />
        <circle className="pin-halo" cx="190" cy="410" r="22" />
        <circle className="pin-p" cx="190" cy="410" r="9" />
        <circle className="pin-halo pin-halo--d" cx="474" cy="132" r="22" />
        <rect className="pin-d" x="464" y="122" width="20" height="20" rx="5" />
        <rect className="pin-d-dot" x="471" y="129" width="6" height="6" rx="1.5" />
        <g className="hp-map__tag" transform="translate(190 372)">
          <rect x="-46" y="-26" width="92" height="26" rx="13" />
          <text textAnchor="middle" y="-9">{pickup}</text>
        </g>
        <g className="hp-map__tag" transform="translate(474 94)">
          <rect x="-54" y="-26" width="108" height="26" rx="13" />
          <text textAnchor="middle" y="-9">{drop}</text>
        </g>
      </svg>
    </div>
  );
}
