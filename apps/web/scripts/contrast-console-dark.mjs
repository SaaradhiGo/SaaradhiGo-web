/**
 * Console contrast in the dark theme (owner, 25 Nov): every console page recorded for every staff
 * role, at 1440 and 390, in dark (and light, so a fix for one never breaks the other). axe-core's
 * colour-contrast rule (WCAG AA: 4.5:1 for text, 3:1 for large text) must find nothing. Pages are
 * answered from the recorded QA fixtures (scripts/fixtures/console), as in the console sweep.
 *
 *   SITE=http://localhost:3100 node scripts/contrast-console-dark.mjs        # THEMES=dark,light ROLES=op
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROLES as ALL_ROLES, consoleAnswer, consolePages } from './fixtures/console.mjs';

const SITE = (process.env.SITE || 'http://localhost:3100').replace(/\/$/, '');
const OUT = process.env.CONTRAST_OUT || 'contrast-out';
const THEMES = (process.env.THEMES || 'dark,light').split(',');
const ROLES = process.env.ROLES ? process.env.ROLES.split(',') : ALL_ROLES;
const WIDTHS = [1440, 390];
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

// Each page once, as the first role recorded on it (the pages are the same code for every role).
const seen = new Set();
const targets = [];
for (const role of ROLES) for (const p of consolePages(role)) if (!seen.has(p)) { seen.add(p); targets.push([role, p]); }

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const failures = [];
for (const theme of THEMES) {
  for (const w of WIDTHS) {
    for (const [role, url] of targets) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, colorScheme: theme });
      await ctx.addCookies([{ name: 'sg-staff-in', value: '1', url: SITE }, { name: 'sg-area', value: 'console', url: SITE },
        { name: 'sg-market', value: 'IN', url: SITE }]);
      await ctx.addInitScript((t) => { try { localStorage.setItem('saaradhi_console_theme', t); } catch {} }, theme);
      await ctx.route(/\/api\/staff\?to=/, async (route) => {
        const req = route.request();
        const a = consoleAnswer(role, req.method(), new URL(req.url()).searchParams.get('to') || '');
        await route.fulfill(a ? { status: a.status, json: a.body } : { status: 404, json: { error: 'no fixture' } });
      });
      const page = await ctx.newPage();
      await page.goto(SITE + url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' }).catch(() => {});
      await page.waitForTimeout(600);
      await page.addScriptTag({ content: AXE });
      const bad = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
        return r.violations.flatMap((v) => v.nodes.map((n) => ({
          target: n.target.join(' '), text: (n.html || '').replace(/\s+/g, ' ').slice(0, 90),
          why: (n.any?.[0]?.message || '').replace(/\s+/g, ' ').slice(0, 160),
        })));
      });
      const label = `${theme} ${w} ${url} (${role})`;
      if (bad.length) {
        failures.push({ label, bad });
        console.log(`FAIL  ${label}: ${bad.length}`);
        for (const b of bad.slice(0, 6)) console.log(`        ${b.target}  ${b.why}`);
        await page.screenshot({ path: path.join(OUT, `${theme}-${w}-${url.replace(/[^a-z0-9]+/gi, '_')}.png`) }).catch(() => {});
      } else {
        console.log(`PASS  ${label}`);
      }
      await ctx.close();
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(failures, null, 1));
console.log(failures.length ? `console contrast: ${failures.length} page(s) below AA` : 'console contrast: pass');
process.exit(failures.length ? 1 : 0);
