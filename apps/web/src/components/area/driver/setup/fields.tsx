'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type DateOrder, dayMonth, datePlaceholder, numericDate, parseNumericDate } from '@/lib/area/format';
import { type FileTile, STATUS_LABEL, STATUS_TONE } from '@/lib/area/requirements';
import { messageFor } from '@/lib/publicAuth';
import { DOCUMENT_ACCEPT } from '@/lib/uploads';
import { ICalendar, ICamera, IDoc } from '../../icons';

/**
 * The guided setup's fields (10 Nov v2). Each saves when the driver leaves it; the step's footer
 * says "Saved automatically" (or what went wrong). Focus is a ring on the field's outer box.
 */
type SaveState = { saving: number; error: string | null };
export const SAVE_TIMEOUT_MS = 60_000;
export const SaveContext = createContext<{ state: SaveState; run: (fn: () => Promise<unknown>) => Promise<boolean> } | null>(null);

export function useSaveState() {
  const tr = useTr();
  const [state, setState] = useState<SaveState>({ saving: 0, error: null });
  // One save at a time: a vehicle date saved while a photo uploads must not write the row back.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  function run(fn: () => Promise<unknown>) {
    setState((s) => ({ saving: s.saving + 1, error: null }));
    const next = queue.current.then(async () => {
      // A request that never answers (an instance replaced mid-deploy) must not hold every later save.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tooLong = new Error('timeout');
      const late = new Promise<never>((_, no) => { timer = setTimeout(() => no(tooLong), SAVE_TIMEOUT_MS); });
      try { await Promise.race([fn(), late]); setState((s) => ({ ...s, saving: s.saving - 1 })); return true; }
      catch (e) {
        setState((s) => ({ saving: s.saving - 1, error: e === tooLong ? tr('That took too long. Check your connection and try again.') : messageFor(e, tr('We could not save that. Try again.')) }));
        return false;
      } finally { clearTimeout(timer); }
    });
    queue.current = next;
    return next;
  }
  return { state, run };
}

export function useSave() {
  const ctx = useContext(SaveContext);
  return ctx?.run ?? (async (fn: () => Promise<unknown>) => { await fn(); return true; });
}

export function Labelled({ id, label, help, error, children }: {
  id: string; label: string; help?: string | null; error?: string | null; children: React.ReactNode;
}) {
  return (
    <div className="su-field">
      <label className="a14 ab" htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="a14 ared" role="alert">{error}</span> : help ? <span className="a14 amut">{help}</span> : null}
    </div>
  );
}

/** A text field saved on blur when it changed. `save` returns a promise; its error shows under the field. */
export function TextField({ id, label, help, value, save, clean = (v) => v, placeholder, inputMode, maxLength, type = 'text', autoComplete, testid }: {
  id: string; label: string; help?: string | null; value: string; save: (v: string) => Promise<unknown>;
  clean?: (v: string) => string; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number; type?: string; autoComplete?: string; testid?: string;
}) {
  const run = useSave();
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const saved = useRef(value);
  useEffect(() => { setV(value); saved.current = value; }, [value]);
  async function blur() {
    if (v === saved.current || !v.trim()) return;
    setErr(null);
    let problem: string | null = null;
    const ok = await run(async () => { try { await save(v); } catch (e) { problem = messageFor(e, ''); throw e; } });
    if (ok) saved.current = v; else setErr(problem);
  }
  return (
    <Labelled id={id} label={label} help={help} error={err}>
      <div className={`ainput${err ? ' ainput--bad' : ''}`}>
        <input id={id} type={type} value={v} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength}
          autoComplete={autoComplete} data-testid={testid} onChange={(e) => setV(clean(e.target.value))} onBlur={() => void blur()} />
      </div>
    </Labelled>
  );
}

/** A date typed in the market's order (dd/mm/yyyy in India, mm/dd/yyyy in the USA) or picked; sent as ISO. */
export function DateField({ id, label, help, value, order, save, testid }: {
  id: string; label: string; help?: string | null; value: string | null; order: DateOrder;
  save: (iso: string) => Promise<unknown>; testid?: string;
}) {
  const tr = useTr();
  const run = useSave();
  const [text, setText] = useState(numericDate(value, order));
  const [err, setErr] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const saved = useRef(value ?? '');
  useEffect(() => { setText(numericDate(value, order)); saved.current = value ?? ''; }, [value, order]);
  async function commit(iso: string | null) {
    if (!text.trim() && !iso) return;
    if (!iso) { setErr(tr('Enter the date as {p}.').replace('{p}', datePlaceholder(order))); return; }
    setErr(null);
    if (iso === saved.current) return;
    let problem: string | null = null;
    const ok = await run(async () => { try { await save(iso); } catch (e) { problem = messageFor(e, ''); throw e; } });
    if (ok) saved.current = iso; else setErr(problem);
  }
  const example = numericDate('2030-12-31', order);
  return (
    <Labelled id={id} label={label} help={help ?? tr('For example {d}').replace('{d}', example)} error={err}>
      <div className={`ainput${err ? ' ainput--bad' : ''}`}>
        <input id={id} value={text} placeholder={datePlaceholder(order)} inputMode="numeric" maxLength={10} data-testid={testid}
          data-date-order={order} onChange={(e) => setText(e.target.value)} onBlur={() => void commit(parseNumericDate(text, order))} />
        <button type="button" className="su-pick" aria-label={tr('Choose a date')}
          onClick={() => { const p = picker.current; if (p) { try { p.showPicker(); } catch { p.click(); } } }}>
          <ICalendar size={18} />
        </button>
        <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" className="su-native" value={value ?? ''}
          onChange={(e) => { const iso = e.target.value; if (iso) { setText(numericDate(iso, order)); void commit(iso); } }} />
      </div>
    </Labelled>
  );
}

export function SelectField({ id, label, help, value, options, onChange, placeholder, testid }: {
  id: string; label: string; help?: string | null; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; placeholder?: string; testid?: string;
}) {
  const tr = useTr();
  return (
    <Labelled id={id} label={label} help={help}>
      <div className="ainput">
        <select id={id} value={value} data-testid={testid} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder ?? tr('Choose')}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </Labelled>
  );
}

export function FilePill({ status }: { status: FileTile['status'] }) {
  const tr = useTr();
  return <span className={`apill ${STATUS_TONE[status]} su-pill`} data-status={status}>{tr(STATUS_LABEL[status])}</span>;
}

/** One document or photo: its own status, the reviewer's reason, when it was uploaded, and Upload or Replace. */
export function DocTile({ file, upload, accept = DOCUMENT_ACCEPT, photo = false, wide = false }: {
  file: FileTile; upload: (f: File) => Promise<unknown>; accept?: string; photo?: boolean; wide?: boolean;
}) {
  const tr = useTr();
  const { locale } = useLocale();
  const run = useSave();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const present = file.status !== 'missing';
  const when = file.uploaded_at ? dayMonth(file.uploaded_at, locale) : '';
  return (
    <div className={`su-tile${present ? '' : ' su-tile--empty'}${wide ? ' su-tile--wide' : ''}`} data-file={file.key} data-status={file.status}>
      <span className={`su-thumb${present ? ' su-thumb--on' : ''}`} aria-hidden="true">{photo ? <ICamera size={20} /> : <IDoc size={20} />}</span>
      <div className="agrow">
        <div className="ab">{tr(file.label)}</div>
        <div className="arow a14 su-tile__meta">
          <FilePill status={file.status} />
          {file.status === 'rejected' && file.reason ? <span className="amut">{file.reason}</span>
            : present && when && file.status !== 'approved' ? <span className="amut">{tr('Uploaded {d}').replace('{d}', when)}</span> : null}
        </div>
      </div>
      <input ref={input} type="file" accept={accept} className="sr-only" aria-label={tr(file.label)} data-testid={`file-${file.key}`}
        onChange={(e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) { setBusy(true); void run(() => upload(f)).finally(() => setBusy(false)); }
        }} />
      {present && file.status !== 'rejected' ? (
        <button type="button" className="abtn abtn--ghost su-tbtn" disabled={busy} onClick={() => input.current?.click()}>
          {tr(busy ? 'Uploading…' : 'Replace')}
        </button>
      ) : (
        <button type="button" className="abtn abtn--dark su-tbtn" disabled={busy} data-testid={`upload-${file.key}`} onClick={() => input.current?.click()}>
          <ICamera size={16} />{tr(busy ? 'Uploading…' : 'Upload')}
        </button>
      )}
    </div>
  );
}
