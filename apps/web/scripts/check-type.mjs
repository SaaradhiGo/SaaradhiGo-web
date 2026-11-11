// Static half of the type gate (approved design, 2026-11-07): no font size
// on the public site except through the five --text-* tokens. Fails on
//   - a `font-size:` in a public stylesheet whose value is not var(--text-*)
//     (the token definitions in site.css are the one exception), and
//   - in a public component, an inline fontSize, a Tailwind arbitrary size
//     (text-[15px]) or a Tailwind size off the scale (text-xs, text-lg, ...).
// The console keeps its own scale and is not scanned.
//
//   npm run check-type
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const consoleFile = (f) => /[\\/](console|\(console\))[\\/]|console\.css$|[\\/]login[\\/]/.test(f);

const failures = [];
const STYLES = ['src/styles/site.css', 'src/styles/area.css', 'src/styles/type.css', 'src/styles/home.css', 'src/styles/saaradhigo.css', 'src/styles/tokens.css', 'src/app/globals.css'];
for (const f of STYLES) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const m = line.match(/font-size:\s*([^;}]+)/);
    if (m && !/^var\(--text-(display|heading|title|body|small)\)/.test(m[1].trim())) {
      failures.push(`${f}:${i + 1}: font-size: ${m[1].trim()}`);
    }
  });
}

const OFF_SCALE = /(?:^|[\s"'`])(?:[a-z]+:)?text-(?:xs|lg|xl|[2-9]xl|\[[^\]]+\])(?=[\s"'`]|$)/;
for (const f of walk('src').filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) && !consoleFile(f))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/fontSize\s*:/.test(line)) failures.push(`${f}:${i + 1}: inline fontSize`);
    const m = line.match(OFF_SCALE);
    if (m) failures.push(`${f}:${i + 1}: ${m[0].trim()}`);
  });
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(failures.length ? `${failures.length} raw font sizes` : 'type check: pass');
process.exit(failures.length ? 1 : 0);
