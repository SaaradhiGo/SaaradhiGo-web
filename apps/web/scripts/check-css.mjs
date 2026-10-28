// Regression guard: the stylesheets are valid, and every token they use exists.
//
// WHY
//   tokens.css declared the entire `--ops-*` ramp INSIDE `.fare { }` -- one
//   missing brace -- so the console's colour tokens applied to the fare
//   figure and nowhere else. The CSS was syntactically valid, the token
//   guard saw tokens, the browser quietly resolved every `var(--ops-*)` to
//   nothing. console.css also referenced four tokens that had never been
//   defined. Nothing in lint, type-check or build notices any of that.
//
// WHAT IT CHECKS
//   1. Every .css file under src/ parses (postcss). An unclosed block or a
//      stray brace fails here.
//   2. In src/styles/tokens.css, a custom property may be declared only in
//      a rule whose selector is a theme root (`:root`, `[data-theme="dark"]`,
//      `[data-theme="light"]`, or a list of those). A token inside any other
//      rule is the `.fare` bug.
//   3. Every token the light theme needs is defined: everything declared
//      for dark (or on the plain `:root`) must also be declared for light,
//      otherwise the light console inherits dark values for it.
//   4. Every `var(--name)` used anywhere under src/ or in tailwind.config.ts
//      names a custom property declared somewhere under src/. (`--tw-*` is
//      Tailwind's own and is ignored.)
//
//   An optional first argument is the app root to check; used by the proof
//   run, which copies the tree, plants each error and expects exit 1.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
const TOKEN_FILE = path.join(root, 'src', 'styles', 'tokens.css');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const problems = [];

const srcFiles = walk(path.join(root, 'src'));
const cssFiles = srcFiles.filter((f) => f.endsWith('.css'));
const codeFiles = [
  ...srcFiles.filter((f) => /\.(ts|tsx|mjs|js)$/.test(f)),
  path.join(root, 'tailwind.config.ts'),
].filter(existsSync);

// 1. parse
const parsed = new Map();
for (const f of cssFiles) {
  const text = readFileSync(f, 'utf8');
  try {
    parsed.set(f, postcss.parse(text, { from: f }));
  } catch (err) {
    problems.push(`${rel(f)}:${err.line ?? '?'}: does not parse -- ${err.reason ?? err.message}`);
  }
}

// 2 and 3. where tokens are declared
const ROOT_PART = /^(:root|\[data-theme=["'](dark|light)["']\])$/;
const declared = new Set();
const darkTokens = new Set();
const lightTokens = new Set();

for (const [f, ast] of parsed) {
  ast.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return;
    declared.add(decl.prop);
    if (f !== TOKEN_FILE) return;

    const parent = decl.parent;
    const parts = parent?.type === 'rule'
      ? parent.selector.split(',').map((s) => s.trim())
      : [];
    const isRoot = parts.length > 0 && parts.every((p) => ROOT_PART.test(p));
    if (!isRoot) {
      const where = parent?.type === 'rule' ? `inside \`${parent.selector}\`` : `inside a ${parent?.type ?? 'non-rule'}`;
      problems.push(`${rel(f)}:${decl.source?.start?.line ?? '?'}: token ${decl.prop} declared ${where}; tokens belong on :root / [data-theme] only`);
      return;
    }
    const sel = parent.selector;
    const forDark = /:root/.test(sel) || /data-theme=["']dark["']/.test(sel);
    const forLight = /data-theme=["']light["']/.test(sel);
    const plainRoot = parts.every((p) => p === ':root');
    if (forDark) darkTokens.add(decl.prop);
    if (forLight || plainRoot) lightTokens.add(decl.prop);
  });
}

for (const t of darkTokens) {
  if (!lightTokens.has(t)) {
    problems.push(`${rel(TOKEN_FILE)}: ${t} is defined for the dark theme but not for [data-theme="light"]`);
  }
}

// 4. every var(--x) names something declared
const VAR = /var\(\s*(--[A-Za-z0-9_-]+)/g;
const used = new Map(); // token -> first file:line
for (const f of [...cssFiles, ...codeFiles]) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(VAR)) {
      const name = m[1];
      if (name.startsWith('--tw-')) continue;
      if (!used.has(name)) used.set(name, `${rel(f)}:${i + 1}`);
    }
  });
}
for (const [name, where] of used) {
  if (!declared.has(name)) problems.push(`${where}: var(${name}) but no stylesheet declares ${name}`);
}

if (problems.length > 0) {
  console.error('CSS check failed:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `CSS check passed: ${cssFiles.length} stylesheets parse, ${declared.size} tokens declared, `
  + `${used.size} distinct tokens used, light theme covers all ${darkTokens.size} dark tokens.`,
);
