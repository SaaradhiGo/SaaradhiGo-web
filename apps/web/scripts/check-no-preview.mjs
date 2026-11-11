// Regression guard: the sign-in preview strip is not in the built output.
//
// WHY
//   `app/login/LoginPreview.tsx` lets a reviewer reach every sign-in state
//   with `?preview=`. It must not exist on production -- not hidden, not
//   gated, not there. The page imports it through a branch on the
//   build-time constant NEXT_PUBLIC_CONSOLE_PREVIEW, so a build made
//   without that variable should emit no trace of it. This asserts that
//   against the actual `.next` output rather than trusting the bundler.
//
// HOW
//   The component carries a marker string, `console-preview-strip`, and
//   its stylesheet a class, `login__preview`. Neither appears anywhere
//   else in the source. Every file under .next/static and .next/server is
//   searched for both.
//
//   Without the variable (the default, and what CI does): finding either
//   fails. With EXPECT_PREVIEW=1 (a QA/local build made with the variable
//   set): NOT finding them fails, which is how the check proves it can
//   see the thing it guards against.
//
// It runs as its own CI step after `next build`.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKERS = ['console-preview-strip', 'login__preview'];
const DIRS = ['static', 'server'].map((d) => path.join(root, '.next', d));
const expectPresent = process.env.EXPECT_PREVIEW === '1';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(d));
if (files.length === 0) {
  console.error('No build output under .next/static or .next/server. Run `next build` first.');
  process.exit(2);
}

const hits = [];
for (const full of files) {
  if (!/\.(js|css|json|html|txt|map)$/.test(full)) continue;
  const text = readFileSync(full, 'utf8');
  for (const m of MARKERS) {
    if (text.includes(m)) hits.push(`${path.relative(root, full)}: ${m}`);
  }
}

if (expectPresent) {
  if (hits.length === 0) {
    console.error('EXPECT_PREVIEW=1 but no preview marker was found in the build output; the guard cannot see what it guards.');
    process.exit(1);
  }
  console.log(`Preview check (positive mode): ${hits.length} marker hit(s), as expected for a preview build.`);
  process.exit(0);
}

if (hits.length > 0) {
  console.error('The sign-in preview strip is in the production bundle:\n');
  for (const h of hits.slice(0, 20)) console.error(`  ${h}`);
  console.error('\nIt must be compiled out. Check the NEXT_PUBLIC_CONSOLE_PREVIEW branch in app/login/page.tsx.');
  process.exit(1);
}

console.log(`Preview check passed: no preview code in ${files.length} output files.`);
