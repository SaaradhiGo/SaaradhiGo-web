/**
 * The product standard's component set (17 Nov 2026). Every screen builds from these; styles in
 * src/styles/ui.css, colours only from the --ui-* tokens. Layouts are fluid at any width.
 */
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { IconAlert, IconInfo } from './icons';

type Kids = { children?: ReactNode; className?: string; style?: CSSProperties };
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Section({ band, tight, children, className, id, labelledBy }: Kids & { band?: boolean; tight?: boolean; id?: string; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cx(tight ? 'ui-section--tight' : 'ui-section', band && 'ui-band', className)}>
      <div className="ui-wrap">{children}</div>
    </section>
  );
}

type BtnKind = 'primary' | 'secondary' | 'quiet';
export function Button({ kind = 'primary', block, href, children, className, ...rest }:
  Kids & { kind?: BtnKind; block?: boolean; href?: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>) {
  const cls = cx('ui-btn', `ui-btn--${kind}`, block && 'ui-btn--block', className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" className={cls} {...rest}>{children}</button>;
}

export function Card({ raised, children, className, style }: Kids & { raised?: boolean }) {
  return <div className={cx('ui-card', raised && 'ui-card--raised', className)} style={style}>{children}</div>;
}

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="ui-error" id={`${id}-error`}>{error}</span> : hint ? <span className="ui-hint" id={`${id}-hint`}>{hint}</span> : null}
    </div>
  );
}

export function Chip({ tone, children }: { tone?: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={cx('ui-chip', tone && `ui-chip--${tone}`)}>{children}</span>;
}

export function Alert({ tone = 'info', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <div className={`ui-alert ui-alert--${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Tabs({ tabs, selected, onSelect, label }: { tabs: string[]; selected: string; onSelect?: (t: string) => void; label: string }) {
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" className="ui-tab" aria-selected={t === selected} onClick={() => onSelect?.(t)}>{t}</button>
      ))}
    </div>
  );
}

export function Table({ caption, head, rows }: { caption: string; head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="ui-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="ui-table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row">{r[0]}</th>
              {r.slice(1).map((c, j) => <td key={j} data-label={head[j + 1]}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Toast({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ui-toast" role="status">
      <IconInfo className="ui-icon ui-icon--sm" />
      <div><b>{title}</b>{children ? <div>{children}</div> : null}</div>
    </div>
  );
}

export function DialogBox({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="ui-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <h2 className="ui-title">{title}</h2>
      <div className="ui-body">{children}</div>
      <div className="ui-row" style={{ justifyContent: 'flex-end' }}>{actions}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="ui-state">
      {icon}
      <h3 className="ui-title">{title}</h3>
      <p className="ui-body">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="ui-state ui-state--error" role="alert">
      <IconAlert />
      <h3 className="ui-title">{title}</h3>
      <p className="ui-body">{body}</p>
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return <div className="ui-skeleton" style={{ width, height }} aria-hidden="true" />;
}

/** A real product screen (a screenshot of our own app or web) in a phone frame. */
export function Device({ src, alt, width }: { src: string; alt: string; width?: number }) {
  return (
    <div className="ui-device" style={width ? ({ ['--ui-device-w' as string]: `${width}px` } as CSSProperties) : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} decoding="async" fetchPriority="low" width={390} height={844} />
    </div>
  );
}
