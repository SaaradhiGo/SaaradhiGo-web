/**
 * The line icons of the approved design (2026-11-07), drawn as in the
 * reference pages. Each takes its colour from `currentColor` and its size
 * from CSS, so the same glyph serves both themes.
 */
type P = { className?: string };
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const LockIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2.2" className={className}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);
export const BigLockIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
export const ShieldIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2.2" className={className}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
  </svg>
);
export const ShieldAlertIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);
export const ShieldCheckIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2.2" className={className}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </svg>
);
export const PinIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
export const LocateIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);
export const CarIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="1.8" className={className}>
    <path d="M5 16V11l2-5h10l2 5v5" />
    <path d="M3 16h18v3H3z" />
    <circle cx="7.5" cy="13" r="1" />
    <circle cx="16.5" cy="13" r="1" />
  </svg>
);
export const PhoneDeviceIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <path d="M11 18h2" />
  </svg>
);
export const EyeIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const ListIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);
export const CardIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
  </svg>
);
export const KeyLockIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="1.8" className={className}>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    <path d="M12 15v2" />
  </svg>
);
export const CallIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
export const SearchIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2" className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const TickIcon = ({ className }: P) => (
  <svg {...base} strokeWidth="2.4" className={className}>
    <path d="m5 12 5 5 9-10" />
  </svg>
);
