/**
 * The small route maps drawn in the approved design (2026-11-07): the rider
 * phone mock-up on the homepage and the "Every trip is live" card on Safety.
 * Illustrations with the design's fixed colours, like the logo artwork.
 */
type P = { className?: string };

export function RideMiniMap() {
  return (
    <svg width="214" height="130" viewBox="0 0 214 130">
      <path d="M0 34H214M0 92H214M50 0V130M130 0V130M190 0V130" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M150 112 C 120 96, 100 70, 80 56 S 44 30, 36 20" stroke="#1B1A17" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="150" cy="112" r="7" fill="#0D7762" stroke="#FFFFFF" strokeWidth="2.5" />
      <rect x="28" y="12" width="16" height="16" rx="4" fill="#1B1A17" />
      <rect x="33" y="17" width="6" height="6" rx="1" fill="#F5A623" />
    </svg>
  );
}

export function TripMiniMap() {
  return (
    <svg viewBox="0 0 260 92" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M0 30H260M0 70H260M60 0V92M150 0V92M220 0V92" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M20 76 C 80 76, 100 20, 160 26 S 220 50, 244 16" stroke="#1B1A17" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="76" r="7" fill="#0D7762" stroke="#FFFFFF" strokeWidth="2.5" />
      <rect x="236" y="8" width="16" height="16" rx="4" fill="#1B1A17" />
      <rect x="241" y="13" width="6" height="6" rx="1" fill="#F5A623" />
    </svg>
  );
}

/** The pickup dot and drop square used in the panel and the fare ticket. */
export const PickupMark = ({ className }: P) => (
  <svg width="12" height="12" viewBox="0 0 12 12" className={className} aria-hidden="true">
    <circle cx="6" cy="6" r="5" fill="#0D7762" />
  </svg>
);
export const DropMark = ({ className }: P) => (
  <svg width="12" height="12" viewBox="0 0 12 12" className={className} aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" rx="2.5" fill="#1B1A17" stroke="#FFFFFF" strokeWidth="0.5" />
    <rect x="4" y="4" width="4" height="4" rx="1" fill="#F5A623" />
  </svg>
);
