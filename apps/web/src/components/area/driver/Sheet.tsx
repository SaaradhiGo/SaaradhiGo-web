'use client';

import { useEffect, useRef } from 'react';
import { useTr } from '@/i18n/website';

/**
 * A dialog sheet (11 Nov): focus moves into it, Tab stays inside, Escape or Close shuts it, and
 * focus goes back to the control that opened it. A bottom sheet on a phone, centred on a desktop.
 */
export function Sheet({ label, onClose, children, testid }: { label: string; onClose: () => void; children: React.ReactNode; testid?: string }) {
  const tr = useTr();
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const all = [...box.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex="0"]')];
      if (!all.length) return;
      const first = all[0]; const last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); opener?.focus?.(); };
  }, []);
  return (
    <div className="asheet-scrim" onClick={onClose}>
      <div ref={box} className="asheet" role="dialog" aria-modal="true" aria-label={label} data-testid={testid} onClick={(e) => e.stopPropagation()}>
        <div className="arow" style={{ justifyContent: 'space-between', gap: 12 }}>
          <h2 className="a20">{label}</h2>
          <button type="button" className="abtn abtn--ghost" onClick={onClose} data-autofocus>{tr('Close')}</button>
        </div>
        {children}
      </div>
    </div>
  );
}
