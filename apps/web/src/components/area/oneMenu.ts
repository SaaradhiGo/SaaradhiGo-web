'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * One open menu at a time (14 Nov): the driver's More and the avatar menu overlapped. Opening a
 * menu tells the others, which close.
 */
const EVENT = 'sg-menu-open';

export function useOneMenu(id: string): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(false);
  useEffect(() => {
    const other = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) setOpenState(false); };
    window.addEventListener(EVENT, other);
    return () => window.removeEventListener(EVENT, other);
  }, [id]);
  const setOpen = useCallback((next: boolean) => {
    if (next) window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
    setOpenState(next);
  }, [id]);
  return [open, setOpen];
}
