// Regression guard: the site must ship its icons.
//
// WHY
//   /favicon.ico returned 404 on every page of the deployed QA site, because
//   nothing in src/app provided one. Browsers request it unprompted, so each
//   page load logged a failed resource in the operator's console. Next.js
//   serves these three by file convention alone -- there is no import to break
//   and no reference for a type-check or lint rule to catch, so deleting or
//   renaming one fails silently and only shows up in a browser.
//
// This repo has no test framework and adding one to assert three files exist
// would be heavier than the thing it guards, so this runs as its own CI step.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/app',
);

// Each entry: the file Next.js serves by convention, and the leading bytes
// that prove it is really that format rather than an empty or wrong-typed
// placeholder committed by accident.
const REQUIRED = [
  { file: 'favicon.ico', magic: [0x00, 0x00, 0x01, 0x00], label: 'ICO' },
  { file: 'icon.png', magic: [0x89, 0x50, 0x4e, 0x47], label: 'PNG' },
  { file: 'apple-icon.png', magic: [0x89, 0x50, 0x4e, 0x47], label: 'PNG' },
];

const problems = [];

for (const { file, magic, label } of REQUIRED) {
  const full = path.join(appDir, file);

  if (!existsSync(full)) {
    problems.push(`${file}: missing -- the browser will get a 404 for it`);
    continue;
  }

  const bytes = readFileSync(full);

  if (bytes.length < 100) {
    problems.push(`${file}: only ${bytes.length} bytes, which is not a real icon`);
    continue;
  }

  const head = [...bytes.subarray(0, magic.length)];
  if (!magic.every((b, i) => head[i] === b)) {
    problems.push(
      `${file}: not a ${label} (first bytes ${head.map((b) => b.toString(16)).join(' ')})`,
    );
  }
}

if (problems.length) {
  console.error('Icon check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Icon check passed: ${REQUIRED.map((r) => r.file).join(', ')}`);
