/**
 * References people see (owner 24 Nov): "HYD-261116-K7Q4", "D-HYD-7K3Q". Never a database id;
 * a row the server has not given one yet shows "—".
 */
export function refOf(row: unknown): string {
  const r = (row ?? {}) as { ref?: unknown; public_ref?: unknown };
  return (typeof r.ref === 'string' && r.ref) || (typeof r.public_ref === 'string' && r.public_ref) || '—';
}
