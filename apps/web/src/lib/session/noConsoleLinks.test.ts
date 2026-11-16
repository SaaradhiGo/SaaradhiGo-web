/**
 * 13 Nov: the console moved under /ops, and a codemod prefixed its links. A rider's "My trips"
 * was caught by it and sent riders to the staff login. Rider, driver and public code may link to
 * the console in exactly one place: the operator's "Open the console" in the header menu.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');
const PUBLIC_CODE = ['components/area', 'components/sg', 'components/pages', 'components/home', 'components/AuthNav.tsx',
  'app/(public)', 'app/(rider)', 'app/(driver)', 'lib/area'];
const ALLOWED: [string, string][] = [['components/AuthNav.tsx', '/ops/login']];
const LINK = /['"`](\/ops(?:\/[^'"`\s]*)?)['"`]/g;

function files(p: string): string[] {
  const full = path.join(SRC, p);
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((f) => files(path.join(p, f)));
}

describe('rider, driver and public code never links into the staff console', () => {
  it('only the operator menu item points at /ops', () => {
    const found: string[] = [];
    for (const f of PUBLIC_CODE.flatMap(files).filter((x) => /\.tsx?$/.test(x) && !/\.test\./.test(x))) {
      const rel = f.replace(/\\/g, '/');
      const text = readFileSync(path.join(SRC, f), 'utf8');
      for (const m of text.matchAll(LINK)) {
        if (!ALLOWED.some(([af, href]) => af === rel && href === m[1])) found.push(`${rel}: ${m[1]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('the rider header menu links My trips to /trips', () => {
    const nav = readFileSync(path.join(SRC, 'components/AuthNav.tsx'), 'utf8');
    expect(nav).toContain('<Link href="/trips" role="menuitem"');
  });
});
