// Regression guard: no colour outside the design system's token file.
//
// WHY
//   This app had two palettes. `tailwind.config.ts` declared gold as
//   `#EEBD2B` with its own `ink` and `sand` scales, `globals.css` restated
//   them in prose, and components reached for `#e8b93b` and `#8ab4f8` when
//   the Maps API wanted a string. None of those were the brand's colours, and
//   nothing in a type-check or a lint rule notices a hex literal, so the
//   divergence was invisible until someone put the site next to the design.
//
//   So: `src/styles/tokens.css` is the only file allowed to contain one, and
//   this asserts it. A new colour now has to be added to the design system
//   before it can be used, which is the point.
//
// It runs as its own CI step, next to `check-icons`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The one file that holds the palette, plus the config that references it.
const TOKEN_FILE = path.join('src', 'styles', 'tokens.css');

// Where a literal is still legitimate, each with the reason:
const ALLOWED = [
  {
    // The PWA manifest and the browser-chrome theme colour are consumed by
    // the OS before any stylesheet is parsed, so they cannot be a var().
    file: path.join('public', 'manifest.webmanifest'),
    reason: 'the OS reads this before any CSS exists',
  },
  {
    file: path.join('src', 'app', 'layout.tsx'),
    reason: 'the <meta name="theme-color"> value, read by browser chrome',
  },
  {
    // The logo artwork as the designers traced it. These are mask sources:
    // the fill never renders, and the mark is coloured by the `logo` token.
    dir: path.join('public', 'brand'),
    reason: 'logo artwork, used as a mask and coloured by the logo token',
  },
];

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.svg', '.json', '.webmanifest']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

// Six- and three-digit hex, and the eight-digit form with alpha. Not `#1`
// (an id selector or a fragment) and not a word that happens to follow a hash.
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

function allowedFor(rel) {
  return ALLOWED.find((a) =>
    a.file ? rel === a.file : rel === a.dir || rel.startsWith(a.dir + path.sep),
  );
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry))) out.push(full);
  }
  return out;
}

const problems = [];

for (const full of [...walk(path.join(root, 'src')), ...walk(path.join(root, 'public')), path.join(root, 'tailwind.config.ts')]) {
  const rel = path.relative(root, full);
  if (rel === TOKEN_FILE) continue;
  if (allowedFor(rel)) continue;

  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const found = line.match(HEX);
    if (found) {
      problems.push(`${rel}:${i + 1}: ${found.join(', ')}`);
    }
  });
}

if (problems.length > 0) {
  console.error('Colour literals found outside src/styles/tokens.css:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nUse a token. If the design system has no colour for this, it needs one'
    + '\nadded to tokens.css first -- that is the check working, not failing.',
  );
  process.exit(1);
}

console.log(
  `Token check passed: no colour literals outside ${TOKEN_FILE}`
  + ` (${ALLOWED.length} documented exemptions).`,
);
