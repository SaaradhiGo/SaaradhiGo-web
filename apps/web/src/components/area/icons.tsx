/** The signed-in designs' line icons (design/signed-in-2026-11-08), 24px grid. */
type P = { size?: number };

function Svg({ size = 20, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IDashboard = (p: P) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>
);
export const ICard = (p: P) => <Svg {...p}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></Svg>;
export const IList = (p: P) => <Svg {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></Svg>;
export const IDoc = (p: P) => <Svg {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></Svg>;
export const IBank = (p: P) => <Svg {...p}><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" /></Svg>;
export const IHelp = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></Svg>;
export const IUser = (p: P) => <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Svg>;
export const IMoon = (p: P) => <Svg {...p}><path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" /></Svg>;
export const ISun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const IPower = (p: P) => <Svg {...p}><path d="M12 3v9" /><path d="M6.3 7.3a8 8 0 1 0 11.4 0" /></Svg>;
export const IAlert = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></Svg>;
export const IClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IHome = (p: P) => <Svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></Svg>;
export const IBriefcase = (p: P) => <Svg {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5h8v2" /></Svg>;
export const IPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const ITarget = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>;
export const IChevron = (p: P) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const IBack = (p: P) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const ILock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
export const IShield = (p: P) => <Svg {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></Svg>;
export const IPhone = (p: P) => <Svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></Svg>;
export const IShare = (p: P) => <Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></Svg>;
export const IDownload = (p: P) => <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></Svg>;
export const ICar = (p: P) => <Svg {...p}><path d="M5 17h14v-5l-2-5H7l-2 5z" /><circle cx="8" cy="17" r="2" /><circle cx="16" cy="17" r="2" /></Svg>;
export const ISwitch = (p: P) => <Svg {...p}><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></Svg>;
export const ILogout = (p: P) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>;
