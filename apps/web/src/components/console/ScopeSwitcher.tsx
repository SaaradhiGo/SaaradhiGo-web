'use client';

import { useEffect, useState } from 'react';
import {
  AdminAccess,
  readSelectedScope,
  writeSelectedScope,
} from '@/lib/adminScope';

/**
 * Which region the operator is looking at.
 *
 * WHY IT IS NOT ALWAYS A DROPDOWN
 * -------------------------------
 * Most operators hold exactly one scope. A select with one option is a
 * control that cannot be operated, and an operator who tries it once
 * stops trusting the rest of the interface. So one scope renders as a
 * label: it still answers "where am I", which is the question that
 * matters when the same console serves Hyderabad and Austin.
 *
 * AN UNMIGRATED ACCOUNT IS TOLD SO
 * --------------------------------
 * While the access migration is open, an account with no assignments
 * sees every region. Drawing an empty picker there would imply a
 * restriction that is not being enforced, so it says "All regions —
 * not yet scoped" instead. That line disappearing is how an operator
 * knows their account has been migrated.
 *
 * Changing the scope reloads the page rather than re-fetching in place.
 * Every console page reads the selection when it queries, and a reload is
 * the one way to be sure none of them is still showing the previous
 * region's rows — which, on a page about money, is worth a flicker.
 */
export function ScopeSwitcher({ access }: { access: AdminAccess | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  // After mount only: localStorage does not exist during server rendering,
  // and reading it in useState makes the two renders disagree (React error 418,
  // which this console already shipped once).
  useEffect(() => setSelected(readSelectedScope()), []);

  if (!access) return null;

  if (access.access_model === 'legacy_unscoped') {
    return (
      <div className="ops__scope">
        <span className="ops__scope-label">Region</span>
        <b>All regions</b>
        <small>Not yet scoped</small>
      </div>
    );
  }

  const { scopes } = access;
  if (scopes.length === 0) return null;

  if (scopes.length === 1) {
    return (
      <div className="ops__scope">
        <span className="ops__scope-label">Region</span>
        <b>{scopes[0].name}</b>
        {scopes[0].status !== 'active' && <small>{scopes[0].status}</small>}
      </div>
    );
  }

  function change(code: string) {
    writeSelectedScope(code || null);
    window.location.reload();
  }

  const shallowest = scopes.reduce((a, b) => (a.depth <= b.depth ? a : b));

  return (
    <div className="ops__scope">
      <label className="ops__scope-label" htmlFor="ops-scope">
        Region
      </label>
      <select
        id="ops-scope"
        className="ops__scope-select"
        value={selected ?? ''}
        onChange={(e) => change(e.target.value)}
      >
        {/* Empty value means "everything I hold", which is not the same as
            any single node once an operator holds two unrelated cities. */}
        <option value="">Everything I cover</option>
        {scopes.map((scope) => (
          <option key={scope.code} value={scope.code}>
            {/* Indented by depth so a city reads as being inside its state
                without needing a tree widget. */}
            {' '.repeat((scope.depth - shallowest.depth) * 2)}
            {scope.name}
            {scope.status !== 'active' ? ` (${scope.status})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
