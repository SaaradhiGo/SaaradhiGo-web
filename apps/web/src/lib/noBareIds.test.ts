import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner 24 Nov: no screen renders a bare database id (T-232, D-18, PO-3, TKT-3, APR-12, #41).
// References come from the server (base.public_ref); a missing one reads as a word.
const ROOTS = ['src/app/(console)', 'src/components/console'];
const BAD = [
  /(^|[^A-Za-z`$])(T|D|R|PO|TKT|APR|W)-\{[A-Za-z_][\w.]*\}/, // JSX: T-{t.id}
  /(^|[^A-Za-z0-9_])(T|D|R|PO|TKT|APR|W)-\$\{/, // template: `T-${id}`, ` · APR-${id}`
  />#\{[\w.]*id\}</, // JSX: >#{t.id}<
  /`(Driver |Rider |Flag )?#\$\{[\w.]*id\}`/, // template: `#${id}`
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('references people see', () => {
  it('no console screen builds a label from a database id', () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const f of files(root)) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (BAD.some((rx) => rx.test(line))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
    }
    expect(hits).toEqual([]);
  });
});
