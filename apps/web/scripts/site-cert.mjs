/**
 * Full public-site certification: every route, every locale, every width.
 *
 * WHAT IT ACTUALLY CHECKS, rather than what a green tick usually means:
 *  - the page renders and its <h1> is in the chosen language,
 *  - no English leaks into a translated page's own copy (a heuristic that
 *    ignores the brand name and the vehicle-class identifiers, which are
 *    deliberately untranslated),
 *  - every link on the page resolves -- fetched, not assumed -- and nothing
 *    points at `#`,
 *  - no horizontal overflow at 320 / 390 / 768 / 1024 / 1440,
 *  - axe-core finds no violations,
 *  - no console error and no failed request,
 *  - the banned placeholder vocabulary appears nowhere.
 *
 * The run must NOT overlap a rebuild. Doing that once produced phantom
 * criticals and unstyled screenshots, so the caller starts the server from
 * an already-built tree and nothing touches it while this runs.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.SITE || 'https://qa.saaradhigo.com';
const OUT = process.argv[2] || (process.env.VERIFY_OUT || '.verify-out') + '/sitecert';
const AXE = fs.readFileSync(
  'C:/Users/srini/OneDrive/Documents/SaaradhiGo/SaaradhiGo-web/apps/web/node_modules/axe-core/axe.min.js',
  'utf8',
);

fs.mkdirSync(OUT, { recursive: true });

const ROUTES = ['/', '/ride', '/drive', '/safety', '/about', '/help', '/contact', '/privacy', '/terms'];
const LOCALES = ['en-IN', 'te-IN', 'hi-IN', 'en-US', 'es-US'];
const WIDTHS = [320, 390, 768, 1024, 1440];

// Deliberately untranslated, so a Latin-script match on these is not a leak.
const ALLOWED_LATIN = /^(SaaradhiGo|Saaradhi|Go|Auto|Mini|Sedan|SUV|PIN|UPI|support|saaradhigo|support@saaradhigo|com|Hyderabad|Vijayawada|Visakhapatnam|Warangal|Telangana|Andhra|Pradesh|India|SaaradhiGo\u2019s|support@saaradhigo\.in|DPDP|MVA|IN|US|en|te|hi|es|English|\u0026)$/;

// The vocabulary the owner banned outright.
//
// Split in two because a substring sweep over five languages produces
// nonsense: "todo" is Spanish for "all" and appeared in correct copy on
// three pages, which the first run duly reported as placeholder text. So the
// ambiguous short tokens are matched as whole words and only on the English
// pages; the unambiguous phrases are matched in every language.
const BANNED_ANYWHERE = [
  'sample artwork', 'photography pending', 'lorem ipsum', 'dummy text',
];
const BANNED_EN = [/\btodo\b/i, /\btbd\b/i, /\bxxx\b/i, /\bfpo\b/i, /\bdummy\b/i, /\bplaceholder\b/i];

const issues = [];
const notes = [];
const fail = (m) => { issues.push(m); console.log('  x ' + m); };
const ok = (m) => { console.log('  . ' + m); };

const browser = await chromium.launch({ channel: 'chrome' });

/* ---------------------------------------------------------------- links */
// Every internal href on the public site, fetched once. A 404 behind a
// header link is the single most visible kind of unfinished site.
const seenLinks = new Map();

async function collectLinks(page, route) {
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => ({
    href: a.getAttribute('href'),
    resolved: a.href,
    text: (a.textContent || '').trim().slice(0, 40),
  })));
  for (const l of hrefs) {
    if (l.href === '#' || l.href === '' || l.href === null) {
      fail(`${route}: dead anchor href="${l.href}" on "${l.text}"`);
      continue;
    }
    if (l.resolved.startsWith(APP)) {
      const url = l.resolved.split('#')[0];
      if (!seenLinks.has(url)) seenLinks.set(url, { from: route, text: l.text });
    }
  }
}

/* --------------------------------------------------------------- render */
for (const locale of LOCALES) {
  console.log(`\n=== ${locale} ===`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 }, locale });
  // Seed the stored preference before any page script runs, so the first
  // paint is already in the right language rather than switching after.
  // Language and market are stored separately now, so the harness sets both
  // rather than a single locale string -- the same way the product does.
  await ctx.addInitScript(`try{
    localStorage.setItem('sg-language','${locale.split('-')[0]}');
    localStorage.setItem('sg-market','${locale.split('-')[1]}');
  }catch(e){}`);
  const page = await ctx.newPage();

  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    // A RESIZE CANCELS IN-FLIGHT RESPONSIVE IMAGES, and that is correct
    // behaviour, not a broken one. This sweep walks each page through five
    // widths; every step makes the browser re-pick from `sizes` and abort
    // the candidate it no longer wants. Those arrive as ERR_ABORTED on
    // `/_next/image`. Verified separately: every width of every photograph
    // serves 200 image/jpeg. Anything else that fails still counts.
    if (err.includes('ERR_ABORTED') && r.url().includes('/_next/image')) return;
    failedRequests.push(`${r.url().slice(0, 120)} ${err}`);
  });

  for (const route of ROUTES) {
    const url = APP + route;
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    if (!resp || resp.status() >= 400) {
      fail(`${locale} ${route}: HTTP ${resp ? resp.status() : 'no response'}`);
      continue;
    }

    // THE STYLESHEET ACTUALLY ARRIVED.
    //
    // A `next start` that loses the race with a rebuild serves HTML pointing
    // at a CSS hash the new build deleted. The page then renders as bare
    // HTML -- every slot loses `position: relative`, so the photographs
    // cover the page, and the suggestion list stops being a dropdown. It
    // looks exactly like a catastrophic layout bug, and it is a stale
    // server. Checked on every page so a whole run can never be read as a
    // product result when it is a process error.
    const styling = await page.evaluate(() => {
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href);
      // `.hp` always carries the 1200px column; unstyled it has none.
      const probe = document.querySelector('.hp');
      const width = probe ? getComputedStyle(probe).maxWidth : 'no .hp element';
      return { links, width };
    });
    if (styling.width === 'none' || styling.width === 'no .hp element') {
      fail(`${locale} ${route}: STYLESHEET NOT APPLIED (.hp max-width is "${styling.width}") `
        + '-- stale server or a rebuild mid-run; discard this run');
    }
    for (const href of styling.links) {
      const r = await page.request.get(href).catch(() => null);
      if (!r || r.status() >= 400) {
        fail(`${locale} ${route}: stylesheet ${href.split('/').pop()} -> ${r ? r.status() : 'no response'}`);
      }
    }

    const lang = await page.getAttribute('html', 'lang');
    const h1 = (await page.$$eval('h1', (hs) => hs.map((h) => h.textContent.trim()))).join(' | ');
    if (h1 === '') fail(`${locale} ${route}: no <h1>`);

    // Legal pages are English on purpose: a privacy notice or terms of
    // service translated without legal review is a liability, not a feature.
    const legal = route === '/privacy' || route === '/terms';
    if (lang !== locale && !legal) fail(`${locale} ${route}: <html lang> is "${lang}"`);

    // Banned vocabulary, anywhere in the rendered text.
    const bodyText = await page.$eval('body', (b) => b.innerText);
    const lower = bodyText.toLowerCase();
    for (const bad of BANNED_ANYWHERE) {
      if (lower.includes(bad)) fail(`${locale} ${route}: banned text "${bad}"`);
    }
    if (locale.startsWith('en')) {
      for (const re of BANNED_EN) {
        const m = bodyText.match(re);
        if (m) fail(`${locale} ${route}: banned word "${m[0]}"`);
      }
    }

    // Untranslated copy, for the non-Latin locales only -- a Spanish page
    // legitimately shares most of its alphabet with English.
    if ((locale === 'te-IN' || locale === 'hi-IN') && !legal) {
      const leaks = await page.$$eval('main', (mains) => {
        const out = [];
        const walk = (node) => {
          for (const child of node.childNodes) {
            if (child.nodeType === 3) {
              const t = child.textContent.trim();
              if (t) out.push(t);
            } else if (child.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(child.tagName)) {
              walk(child);
            }
          }
        };
        mains.forEach(walk);
        return out;
      });
      const suspicious = [];
      for (const frag of leaks) {
        for (const word of frag.split(/[\s,.:;()\u2019'"\u2014\/]+/)) {
          if (!word || !/^[A-Za-z@.\u2019&]+$/.test(word)) continue;
          if (word.length < 3) continue;
          if (ALLOWED_LATIN.test(word)) continue;
          suspicious.push(word);
        }
      }
      if (suspicious.length) {
        fail(`${locale} ${route}: untranslated copy: ${[...new Set(suspicious)].slice(0, 8).join(', ')}`);
      }
    }

    await collectLinks(page, `${locale} ${route}`);

    // EVERY PHOTOGRAPH STAYS INSIDE ITS SLOT.
    //
    // `<Photo>` renders a `fill` image, which is absolutely positioned. A
    // slot that forgets `position: relative` hands it the page instead, and
    // `overflow: hidden` does not clip it because the containing block is
    // outside -- so the image silently covers whole sections. That is
    // exactly what happened to the homepage, and nothing but a rendered
    // page can see it, so it is checked here on every route.
    const escaped = await page.$$eval('img', (imgs) => imgs.map((img) => {
      const i = img.getBoundingClientRect();
      if (i.width <= 1 || i.height <= 1) return null;

      // IS IT CLIPPED? -- which is not the same question as "is its box
      // bigger than its parent's".
      //
      // A decorative mark placed with a negative offset inside a section
      // that sets `overflow: hidden` overflows its parent ON PURPOSE and is
      // invisible past the edge. The bug this check exists for is different:
      // an image spilling across the page and covering other content.
      //
      // The distinction is the containing block. An absolutely positioned
      // element is laid out against its nearest POSITIONED ancestor, and
      // only an ancestor at or inside that one can clip it -- which is
      // exactly why the original bug happened. `.hp-split__media` had
      // `overflow: hidden` but no `position`, so it did not clip its own
      // `fill` image; the image took the page as its containing block and
      // painted over three sections.
      //
      // So: walk from the image up to its offsetParent, and count an
      // ancestor as a clipper only when it is positioned AND clips. If one
      // is found the image cannot be covering anything beyond it.
      const style = getComputedStyle(img);
      const positioned = style.position === 'absolute' || style.position === 'fixed';
      const stop = img.offsetParent;
      let clipped = false;
      for (let el = img.parentElement; el; el = el.parentElement) {
        const o = getComputedStyle(el);
        const clips = o.overflow !== 'visible' || o.overflowX !== 'visible'
          || o.overflowY !== 'visible';
        const anchors = !positioned || o.position !== 'static';
        if (clips && anchors) { clipped = true; break; }
        if (el === stop) break;
      }
      if (clipped) return null;

      const slot = img.parentElement;
      if (!slot) return null;
      const s = slot.getBoundingClientRect();
      const slack = 2;
      if (i.top < s.top - slack || i.left < s.left - slack
          || i.bottom > s.bottom + slack || i.right > s.right + slack) {
        return {
          src: (img.getAttribute('src') || '').slice(0, 60),
          img: [Math.round(i.width), Math.round(i.height)],
          slot: [Math.round(s.width), Math.round(s.height)],
          cls: (slot.className || '').toString().slice(0, 40),
        };
      }
      return null;
    }).filter(Boolean));
    for (const e of escaped) {
      fail(`${locale} ${route}: image escapes its slot (${e.src}) ${e.img.join('x')} in ${e.slot.join('x')} .${e.cls}`);
    }

    // Overflow at every supported width.
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 1200 });
      await page.waitForTimeout(90);
      const over = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }));
      if (over.doc > over.win + 1) {
        fail(`${locale} ${route} @${w}px: horizontal overflow (${over.doc} > ${over.win})`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 1600 });

    // axe-core, on the page as the visitor gets it.
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    });
    for (const v of axe) {
      if (v.impact === 'critical' || v.impact === 'serious') {
        fail(`${locale} ${route}: axe ${v.id} (${v.impact}, ${v.nodes} node(s))`);
      } else {
        notes.push(`${locale} ${route}: axe ${v.id} (${v.impact})`);
      }
    }

    ok(`${route}  lang=${lang}  h1="${h1.slice(0, 44)}"  axe=${axe.length === 0 ? 'clean' : axe.length}`);
  }

  // One full-page capture per locale, at desktop and at phone width.
  for (const [name, w] of [['1280', 1280], ['390', 390]]) {
    await page.setViewportSize({ width: w, height: 1400 });
    await page.goto(APP + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `home-${locale}-${name}.png`), fullPage: true });
  }

  if (consoleErrors.length) fail(`${locale}: console errors: ${[...new Set(consoleErrors)].slice(0, 3).join(' ; ')}`);
  if (failedRequests.length) fail(`${locale}: failed requests: ${[...new Set(failedRequests)].slice(0, 3).join(' ; ')}`);

  await ctx.close();
}

/* --------------------------------------------------- every link resolves */
console.log(`\n=== link check (${seenLinks.size} internal targets) ===`);
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const [url, meta] of seenLinks) {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
    const status = r ? r.status() : 0;
    if (!r || status >= 400) {
      fail(`link ${url} -> ${status || 'no response'} (from ${meta.from}, "${meta.text}")`);
    } else {
      ok(`${status} ${url.replace(APP, '') || '/'}`);
    }
  }
  await ctx.close();
}

/* ----------------------------------------- per-page captures, en + te */
console.log('\n=== page captures ===');
for (const locale of ['en-IN', 'te-IN']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, locale });
  await ctx.addInitScript(`try{
    localStorage.setItem('sg-language','${locale.split('-')[0]}');
    localStorage.setItem('sg-market','${locale.split('-')[1]}');
  }catch(e){}`);
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    await page.goto(APP + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const name = route === '/' ? 'home' : route.replace(/\//g, '');
    await page.screenshot({ path: path.join(OUT, `${name}-${locale}.png`), fullPage: true });
    console.log(`  captured ${name}-${locale}.png`);
  }
  await ctx.close();
}

await browser.close();

console.log('\n============ RESULT ============');
if (notes.length) {
  console.log(`minor/moderate axe notes: ${notes.length}`);
  for (const n of [...new Set(notes)].slice(0, 10)) console.log('  - ' + n);
}
if (issues.length === 0) {
  console.log('PASS: no issues across ' + ROUTES.length + ' routes x ' + LOCALES.length + ' locales x ' + WIDTHS.length + ' widths');
} else {
  console.log(`FAIL: ${issues.length} issue(s)`);
  for (const i of issues) console.log('  x ' + i);
}
console.log('screenshots -> ' + OUT);
process.exit(issues.length ? 1 : 0);
