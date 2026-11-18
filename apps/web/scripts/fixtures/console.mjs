// The console's API answers for CI (18 Nov, Phase 2): recorded from QA per staff role, then scrubbed
// (no emails, phones, IPs, secrets or real names). Keyed "METHOD /path?query" as the console asks
// through /api/staff?to=. scripts/fixtures/console/<role>.json; refresh by re-recording.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'console');
export const ROLES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
const cache = new Map();
const load = (role) => {
  if (!cache.has(role)) cache.set(role, JSON.parse(fs.readFileSync(path.join(DIR, `${role}.json`), 'utf8')));
  return cache.get(role);
};

/** The pages each role was recorded on (the address it ended on, e.g. /ops/start -> its home). */
export function consolePages(role) {
  return [...new Set(load(role).pages.map((p) => p.landed))];
}

/** The recorded answer, or the same path with any query, or null. */
export function consoleAnswer(role, method, to) {
  const { answers } = load(role);
  const exact = answers[`${method} ${to}`];
  if (exact) return exact;
  const bare = to.split('?')[0];
  const key = Object.keys(answers).find((k) => k.split('?')[0] === `${method} ${bare}`);
  return key ? answers[key] : null;
}
