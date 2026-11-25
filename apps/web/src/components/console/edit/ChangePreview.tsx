'use client';

/**
 * The Edit pattern's preview (owner, 25 Nov): what changes (before and after) and its impact. The
 * editor sees it before sending, and the approval request carries the same `display`, so the
 * checker approves exactly what the editor saw.
 */
export type ChangeLine = { label: string; from: string; to: string };
export type ImpactTable = { title: string; columns: string[]; rows: string[][]; note?: string };
export type ChangeDisplay = { changes: ChangeLine[]; impact?: ImpactTable | null; effective?: string };

export function isDisplay(v: unknown): v is ChangeDisplay {
  return !!v && typeof v === 'object' && Array.isArray((v as ChangeDisplay).changes);
}

export function ChangePreview({ display, heading = 'What changes' }: { display: ChangeDisplay; heading?: string }) {
  const { changes, impact, effective } = display;
  return (
    <div className="grid gap-3 ops-change">
      <section aria-label={heading}>
        <h3 className="ops-subhead">{heading}</h3>
        {changes.length === 0 ? <p className="help m-0">Nothing is changed yet.</p> : (
          <div className="ops-table-wrap">
            <table className="ops-table ops-table--compact ops-table--auto">
              <caption className="sr-only">{heading}: before and after</caption>
              <thead><tr><th scope="col">Setting</th><th scope="col">In force now</th><th scope="col">After approval</th></tr></thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.label}>
                    <th scope="row">{c.label}</th>
                    <td className="sg-num">{c.from}</td>
                    <td className="sg-num"><mark className="ops-changed">{c.to}</mark></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {impact && impact.rows.length ? (
        <section aria-label={impact.title}>
          <h3 className="ops-subhead">{impact.title}</h3>
          <div className="ops-table-wrap">
            <table className="ops-table ops-table--compact ops-table--auto">
              <caption className="sr-only">{impact.title}</caption>
              <thead><tr>{impact.columns.map((c, i) => <th key={`${c}-${i}`} scope="col" className={i > 1 ? 'num' : undefined}>{c}</th>)}</tr></thead>
              <tbody>
                {impact.rows.map((r, i) => (
                  <tr key={i}>{r.map((cell, j) => (j === 0
                    ? <th key={j} scope="row">{cell}</th>
                    : <td key={j} className={j > 1 ? 'num sg-num' : undefined}>{cell}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {impact.note ? <p className="help m-0">{impact.note}</p> : null}
        </section>
      ) : null}
      {effective ? <p className="ops-note m-0" role="note"><b>When:</b> {effective}</p> : null}
    </div>
  );
}
