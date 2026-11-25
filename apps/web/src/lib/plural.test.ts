/**
 * 25 Nov (owner): "1 Approvals waiting" read wrong. Every count agrees with its noun at 0, 1 and
 * many, and no console string puts a bare count in front of a plural noun.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
  it.each([
    [0, 'day', undefined, '0 days'], [1, 'day', undefined, '1 day'], [2, 'day', undefined, '2 days'],
    [1, 'entry', 'entries', '1 entry'], [12, 'entry', 'entries', '12 entries'], [1500, 'trip', undefined, '1,500 trips'],
    ['1', 'hour', undefined, '1 hour'], [null, 'route', undefined, '0 routes'],
  ])('%s %s', (n, one, many, want) => {
    expect(plural(n as number, one as string, many as string | undefined)).toBe(want);
  });
});

const NOUNS = 'trips|drivers|riders|tickets|days|hours|minutes|weeks|months|entries|routes|calls|zones|codes|events|cities|payouts|approvals|matches|results|requests|rows|items';
// A constant that is never 1 (a limit), or a word that only looks like a count.
const ALLOWED = /MAX_RANGE_DAYS|BULK_CHECKER_ABOVE|NOTE_MIN|NOTE_MAX|\{(columns|signalColumns|dayColumns|placeColumns|verb|dots|trips|zones|all|null|false|access|err)\}|timezone/;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('console counts', () => {
  it('never put a bare count before a plural noun', () => {
    const root = path.resolve(__dirname, '..');
    const files = [...sources(path.join(root, 'components/console')), ...sources(path.join(root, 'app/(console)')), ...sources(path.join(root, 'lib'))];
    const bare = new RegExp(`(\$\{[^}]{1,60}\}|\{[a-zA-Z_.!()?]{1,50}\}) (${NOUNS})\b`);
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(bare);
        if (!m || ALLOWED.test(m[0]) || /=== 1|!== 1|> 1\b|plural\(/.test(line)) return;
        hits.push(`${path.relative(root, f)}:${i + 1} ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
