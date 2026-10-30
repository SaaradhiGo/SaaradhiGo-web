'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, apiDownload } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { PageButtonLink } from '@/components/console/PageLink';
import {
  RANGE_PRESETS, canExport, presetRange, rangeProblem, todayLocal,
} from '@/lib/finance';
import { Download } from '@/components/console/icons';

/**
 * The parts every Finance page shares: the sub-navigation, the date range, the
 * pager and the export button.
 *
 * The sub-navigation is one capability (`finance.read`) for every tab, so it
 * is drawn whole or not at all (the link rule): an operator who can see one
 * Finance page can see them all. The export button is the exception and it is
 * the point: it is drawn ONLY for `finance.export`.
 */

const TABS = [
  { href: '/finance', label: 'Overview' },
  { href: '/finance/payments', label: 'Payments' },
  { href: '/finance/settlements', label: 'Settlements' },
  { href: '/finance/payouts', label: 'Payouts' },
  { href: '/finance/reconciliation', label: 'Reconciliation' },
] as const;

export function FinanceNav() {
  const pathname = usePathname() ?? '';
  // The overview is /finance itself; every other tab owns its sub-paths. A page
  // under /finance that no tab owns (a driver's ledger) marks none of them.
  const current = TABS.find((t) => (t.href === '/finance'
    ? pathname === t.href
    : pathname === t.href || pathname.startsWith(`${t.href}/`)))?.href;
  return (
    <nav className="ops-subnav" aria-label="Finance">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="ops-subnav__link"
          aria-current={current === t.href ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * From / to, with the usual presets. The dates are calendar days in each
 * city's own timezone (the server decides which instants those are), so the
 * bar says nothing about a timezone of its own.
 */
export function RangeBar({
  from, to, onApply, idPrefix = 'range',
}: {
  from: string;
  to: string;
  onApply: (range: { from: string; to: string }) => void;
  idPrefix?: string;
}) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  useEffect(() => { setDraftFrom(from); setDraftTo(to); }, [from, to]);
  const problem = rangeProblem(draftFrom, draftTo);
  // Say what is wrong only once someone has started choosing dates.
  const showProblem = Boolean(draftFrom || draftTo) && problem;
  return (
    <form
      className="ops-rangebar"
      onSubmit={(e) => { e.preventDefault(); if (!problem) onApply({ from: draftFrom, to: draftTo }); }}
    >
      <div className="ops-rangebar__field">
        <label className="ops-form__label" htmlFor={`${idPrefix}-from`}>From</label>
        <input id={`${idPrefix}-from`} type="date" className="ops-select" value={draftFrom}
          max={todayLocal()} onChange={(e) => setDraftFrom(e.target.value)} />
      </div>
      <div className="ops-rangebar__field">
        <label className="ops-form__label" htmlFor={`${idPrefix}-to`}>To</label>
        <input id={`${idPrefix}-to`} type="date" className="ops-select" value={draftTo}
          max={todayLocal()} onChange={(e) => setDraftTo(e.target.value)} />
      </div>
      <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={Boolean(problem)}>Show</button>
      <div className="ops-seg" role="group" aria-label="Date presets">
        {RANGE_PRESETS.map((p) => (
          <button key={p.days} type="button" className="ops-seg__btn"
            onClick={() => onApply(presetRange(p.days))}>{p.label}</button>
        ))}
      </div>
      {showProblem ? <span className="ops-rangebar__problem" role="alert">{problem}</span> : null}
    </form>
  );
}

export function Pager({
  page, totalPages, onPage,
}: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="ops-toolbar">
      <div className="ops-toolbar__left">
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={page <= 1}
          onClick={() => onPage(page - 1)}>Previous</button>
        <span className="ops-toolbar__summary">Page {page} of {totalPages}</span>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

/**
 * Download the CSV for the filters on screen. Drawn only for `finance.export`;
 * the server re-checks, applies the same scope and masking as the table, logs
 * the export with its filters and refuses one over the row cap in words.
 */
export function ExportButton({ path, label = 'Export CSV' }: { path: string; label?: string }) {
  const access = useAdminAccess();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canExport(access)) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await apiDownload(withScope(path));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="ops-export">
      <button type="button" className="ops-toolbtn" disabled={busy} onClick={() => void run()}>
        <Download />{busy ? 'Preparing…' : label}
      </button>
      {error ? <span className="ops-export__error" role="alert">{error}</span> : null}
    </span>
  );
}

/** A link into the driver's statement, drawn only if the operator can open Finance. */
export function LedgerLink({ driverId }: { driverId: number }) {
  return (
    <PageButtonLink page="finance" href={`/finance/drivers/${driverId}/ledger`}>Ledger</PageButtonLink>
  );
}
