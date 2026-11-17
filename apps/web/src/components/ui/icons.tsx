/**
 * The standard's one icon set (17 Nov 2026): 24px grid, 1.75 stroke, round caps, currentColor.
 * Icons sit beside text at 20 or 24px and never on a coloured tile.
 */
import type { ReactNode } from 'react';

type P = { className?: string; title?: string };
function make(paths: ReactNode) {
  return function Icon({ className = 'ui-icon', title }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
        {title ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  };
}

export const IconLock = make(<><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" /></>);
export const IconShield = make(<path d="M12 3 5 6v5.5c0 4.2 3 7.7 7 9.5 4-1.8 7-5.3 7-9.5V6l-7-3Z" />);
export const IconShieldCheck = make(<><path d="M12 3 5 6v5.5c0 4.2 3 7.7 7 9.5 4-1.8 7-5.3 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconAlert = make(<><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4.5" /><path d="M12 17.5h.01" /></>);
export const IconShare = make(<><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" /></>);
export const IconKey = make(<><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2 2M14 9l2 2" /></>);
export const IconPin = make(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" /><circle cx="12" cy="10" r="2.5" /></>);
export const IconCar = make(<><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.5 12h17v4.5h-17z" /><circle cx="7.5" cy="16.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconArrowRight = make(<path d="M5 12h14m-6-6 6 6-6 6" />);
export const IconPhone = make(<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />);
export const IconUser = make(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>);
export const IconWallet = make(<><rect x="3.5" y="6" width="17" height="13" rx="2" /><path d="M16 12.5h4.5M3.5 9.5h17" /></>);
export const IconHelp = make(<><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.5" /><path d="M12 17h.01" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>);
export const IconInfo = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 8h.01" /></>);
export const IconClose = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconMap = make(<><path d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5V6.5Z" /><path d="M9 4v13.5M15 6.5V20" /></>);
export const IconBell = make(<><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>);
export const IconSos = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5" /><path d="M12 16h.01" /></>);
export const IconAuto = make(<><path d="M4 16.5V10a3 3 0 0 1 3-3h6l4 4.5h2.5V16.5" /><path d="M3 16.5h18" /><circle cx="7.5" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /><path d="M13 7v4.5h4" /></>);
export const IconSuv = make(<><path d="M3.5 16.5V11l2-4.5h11l3 4.5h1v5.5" /><path d="M3.5 11h17" /><circle cx="7.5" cy="16.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" /><path d="M10 6.5V11" /></>);
export const IconBike = make(<><circle cx="6" cy="16" r="3" /><circle cx="18" cy="16" r="3" /><path d="m6 16 4-6h5l3 6M9.5 7h3" /></>);

/** Every icon by name, for the /design page. */
export const ICONS = {
  IconLock, IconShield, IconShieldCheck, IconAlert, IconShare, IconKey, IconPin, IconCar, IconClock, IconCheck, IconArrowRight, IconPhone,
  IconUser, IconWallet, IconHelp, IconSearch, IconInfo, IconClose, IconMap, IconBell, IconSos, IconAuto, IconSuv, IconBike,
};
