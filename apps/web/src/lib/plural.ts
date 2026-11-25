/** "1 match", "12 matches", "0 days": a count with the noun it agrees with (owner 25 Nov). */
export function plural(n: number | string | null | undefined, one: string, many = `${one}s`): string {
  const v = Number(n ?? 0);
  return `${Number.isFinite(v) ? v.toLocaleString('en-IN') : String(n)} ${v === 1 ? one : many}`;
}
