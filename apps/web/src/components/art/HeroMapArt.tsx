/**
 * The illustrated map behind the home hero (design of 2026-11-07,
 * design/website-2026-11-07/hero-map.svg). A static drawing, not a live map:
 * it loads no tiles and never asks for a location. Desktop shows all of it
 * under the hero; the phone crops to the route with `viewBox`.
 */
export function HeroMapArt({
  viewBox = '0 0 1440 640',
  fit = 'xMidYMid slice',
  className,
}: {
  viewBox?: string;
  fit?: string;
  className?: string;
}) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio={fit} className={className} aria-hidden="true">
      <rect width="1440" height="640" fill="#EEE8DD"/>
      <path d="M1440 470 C 1300 450, 1180 520, 1060 600 L 1020 640 L 1440 640 Z" fill="#CFE0E8"/>
      <path d="M760 70 h170 a14 14 0 0 1 14 14 v110 a14 14 0 0 1 -14 14 h-170 a14 14 0 0 1 -14 -14 v-110 a14 14 0 0 1 14 -14z" fill="#D6E7D3"/>
      <path d="M1210 250 h150 a14 14 0 0 1 14 14 v90 a14 14 0 0 1 -14 14 h-150 a14 14 0 0 1 -14 -14 v-90 a14 14 0 0 1 14 -14z" fill="#D6E7D3"/>
      <path d="M0 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M120 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M240 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M360 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M480 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M600 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M720 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M840 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M960 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M1080 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M1200 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M1320 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M1440 0 V640" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 40 H1440" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 150 H1440" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 260 H1440" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 370 H1440" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 480 H1440" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 590 H1440" stroke="#FFFFFF" strokeWidth="4" opacity="0.75"/>
      <path d="M0 300 C 300 290, 520 360, 760 330 S 1180 250, 1440 280" stroke="#FFFFFF" strokeWidth="16" fill="none"/>
      <path d="M640 0 C 660 160, 700 360, 860 640" stroke="#FFFFFF" strokeWidth="14" fill="none"/>
      <path d="M1100 0 C 1080 200, 1140 400, 1180 640" stroke="#FFFFFF" strokeWidth="12" fill="none"/>
      <path d="M0 300 C 300 290, 520 360, 760 330 S 1180 250, 1440 280" stroke="#F3D9A4" strokeWidth="3" fill="none" opacity="0.7"/>
      <path d="M792 470 C 820 420, 860 360, 920 332 S 1060 300, 1100 250 S 1130 160, 1186 132" stroke="#FFFFFF" strokeWidth="12" fill="none" strokeLinecap="round"/>
      <path d="M792 470 C 820 420, 860 360, 920 332 S 1060 300, 1100 250 S 1130 160, 1186 132" stroke="#1B1A17" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <circle cx="792" cy="470" r="16" fill="#0D7762" opacity="0.18"/><circle cx="792" cy="470" r="9" fill="#0D7762" stroke="#FFFFFF" strokeWidth="3"/>
      <rect x="1174" y="120" width="24" height="24" rx="6" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="3"/><rect x="1181" y="127" width="10" height="10" rx="2" fill="#F5A623"/>
      <g transform="translate(866 384) rotate(35)"><rect x="-9" y="-15" width="18" height="30" rx="6" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="2"/><rect x="-6" y="-8" width="12" height="7" rx="2" fill="#F5C451"/></g>
      <g transform="translate(700 180) rotate(0)"><rect x="-9" y="-15" width="18" height="30" rx="6" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="2"/><rect x="-6" y="-8" width="12" height="7" rx="2" fill="#F5C451"/></g>
      <g transform="translate(1000 560) rotate(90)"><rect x="-9" y="-15" width="18" height="30" rx="6" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="2"/><rect x="-6" y="-8" width="12" height="7" rx="2" fill="#F5C451"/></g>
      <g transform="translate(1290 420) rotate(-20)"><rect x="-9" y="-15" width="18" height="30" rx="6" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="2"/><rect x="-6" y="-8" width="12" height="7" rx="2" fill="#F5C451"/></g>
      <g transform="translate(560 300) rotate(90)"><rect x="-9" y="-15" width="18" height="30" rx="6" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="2"/><rect x="-6" y="-8" width="12" height="7" rx="2" fill="#F5C451"/></g>
    </svg>
  );
}
