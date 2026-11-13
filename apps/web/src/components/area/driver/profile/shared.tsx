'use client';

import { createContext, useContext, useRef, useState } from 'react';
import { useTr } from '@/i18n/website';
import {
  type ChecklistItem, type Requirements, itemLabel, itemTone, requirements as loadRequirements,
} from '@/lib/area/requirements';
import { type Load, useLoad } from '@/lib/area/useLoad';
import { messageFor } from '@/lib/publicAuth';
import { DOCUMENT_ACCEPT } from '@/lib/uploads';

/** The driver's requirements, loaded once per profile page and shared by its sections. */
export const ReqContext = createContext<Load<Requirements> | null>(null);

export function useRequirementsLoad() {
  return useLoad(loadRequirements);
}

export function useReq(): { data: Requirements | null; reload: () => void } {
  const load = useContext(ReqContext);
  return { data: load?.data ?? null, reload: () => load?.retry() };
}

/** Is this item asked for in the driver's market? */
export function asked(data: Requirements | null, key: string) {
  return !!data && data.config.items[key]?.need !== 'off' && data.config.items[key] !== undefined;
}

export function item(data: Requirements | null, key: string): ChecklistItem | undefined {
  return data?.checklist.items.find((i) => i.key === key);
}

export function StatusPill({ it }: { it?: ChecklistItem }) {
  const tr = useTr();
  if (!it) return null;
  const label = it.status === 'expiring' && it.expires
    ? tr('Expiring {date}').replace('{date}', it.expires) : tr(itemLabel(it));
  return <span className={`apill ${itemTone(it)}`} data-status={it.status}>{label}</span>;
}

export function Reason({ it }: { it?: ChecklistItem }) {
  if (!it?.reason || (it.status !== 'rejected' && it.status !== 'missing')) return null;
  return <p className="a14 ared" role="note">{it.reason}</p>;
}

export function Section({ id, title, it, children }: { id: string; title: string; it?: ChecklistItem; children: React.ReactNode }) {
  return (
    <section id={id} className="acard" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="arow" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 className="a20">{title}</h2>
        <StatusPill it={it} />
      </div>
      {children}
    </section>
  );
}

export function Field({ id, label, children, help }: { id: string; label: string; children: React.ReactNode; help?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label className="a14 amut" htmlFor={id}>{label}</label>
      {children}
      {help && <span className="a14 amut">{help}</span>}
    </div>
  );
}

/** Save button plus the outcome line, for one form. */
export function useSaver() {
  const tr = useTr();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<unknown>, ok = tr('Saved.')) {
    setBusy(true); setNote(null);
    try { await fn(); setNote({ ok: true, text: ok }); return true; }
    catch (e) { setNote({ ok: false, text: messageFor(e, tr('We could not save that. Try again.')) }); return false; }
    finally { setBusy(false); }
  }
  const line = note && <p className={`a14 ${note.ok ? 'agreen' : 'ared'}`} role="status">{note.text}</p>;
  return { busy, run, line };
}

/** Pick a file and send it; shows Upload or Replace and the item's state. */
export function FileSlot({ label, present, onFile, accept = DOCUMENT_ACCEPT, testid }: {
  label: string; present: boolean; onFile: (f: File) => Promise<unknown>; accept?: string; testid?: string;
}) {
  const tr = useTr();
  const input = useRef<HTMLInputElement | null>(null);
  const { busy, run, line } = useSaver();
  return (
    <div className="arow" style={{ justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--c-border)', flexWrap: 'wrap' }}>
      <span className="ab">{label}</span>
      <input ref={input} type="file" accept={accept} className="sr-only" aria-label={label}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => onFile(f), tr('Uploaded. Our team will review it.')); }} />
      <button type="button" className="abtn abtn--ghost a14" style={{ height: 36, padding: '0 14px' }} disabled={busy}
        data-testid={testid} onClick={() => input.current?.click()}>
        {busy ? tr('Uploading…') : tr(present ? 'Replace' : 'Upload')}
      </button>
      {line && <div style={{ width: '100%' }}>{line}</div>}
    </div>
  );
}

export const IMAGE_ACCEPT = 'image/jpeg,image/png';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
