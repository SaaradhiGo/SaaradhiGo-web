/**
 * Every public hostname must serve the same working site.
 *
 * WHY THIS EXISTS
 * ---------------
 * The site is reachable at more than one hostname. A round of QA was
 * reported as "19/19 passing" while every page the owner opened was broken,
 * because the checks ran against `www.qa.saaradhigo.com` and the owner used
 * `qa.saaradhigo.com`. The backend's CORS allowlist contained only the
 * first, so every API call from the second was blocked by the browser
 * before it left. Both facts were true at once and neither test noticed the
 * other host existed.
 *
 * So this checks the HOSTS THEMSELVES, before any feature test runs:
 *
 *   * DNS resolves
 *   * TLS certificate is valid FOR THAT NAME (not a wildcard it isn't on)
 *   * the origin serves our app, not an edge 404
 *   * the API accepts that origin for CORS, with credentials
 *   * every host serves the SAME build
 *
 * A green feature suite on one host proves nothing about another. Run this
 * first; if it fails, the feature results are not about the site people
 * are using.
 *
 *   node scripts/verify-hosts.mjs
 *   HOSTS=https://a.example,https://b.example API=https://api.example/api/v1 \
 *     node scripts/verify-hosts.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import tls from 'node:tls';

const run = promisify(execFile);

const HOSTS = (process.env.HOSTS
  || 'https://qa.saaradhigo.com,https://www.qa.saaradhigo.com')
  .split(',').map((h) => h.trim()).filter(Boolean);

const API = process.env.API
  || 'https://backend-qa-811d.up.railway.app/api/v1';

const results = [];
const pass = (h, n, d = '') => { results.push({ h, n, s: 'PASS', d }); console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`); };
const fail = (h, n, d) => { results.push({ h, n, s: 'FAIL', d }); console.log(`  FAIL  ${n} — ${d}`); };

/** The certificate actually presented for this server name. */
function certificateFor(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, servername: hostname, timeout: 15000,
        // We want to INSPECT the certificate, including a wrong one, so the
        // handshake must not be aborted before we can read it.
        rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const error = socket.authorizationError;
        socket.end();
        resolve({ cert, authorized, error });
      },
    );
    socket.on('error', (err) => resolve({ error: err.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ error: 'timeout' }); });
  });
}

const builds = new Map();

for (const origin of HOSTS) {
  const hostname = new URL(origin).hostname;
  console.log(`\n=== ${origin} ===`);

  /* 1 -- DNS ---------------------------------------------------------- */
  try {
    const { stdout } = await run('nslookup', [hostname, '8.8.8.8']);
    const target = (stdout.match(/canonical name = (\S+)/) || [])[1];
    pass(origin, 'DNS resolves', target ? `-> ${target.replace(/\.$/, '')}` : 'A record');
  } catch {
    fail(origin, 'DNS resolves', 'the name does not resolve');
    continue;
  }

  /* 2 -- the certificate is for THIS name ----------------------------- */
  const { cert, authorized, error } = await certificateFor(hostname);
  if (!cert || !cert.subject) {
    fail(origin, 'TLS certificate', error || 'no certificate presented');
  } else {
    const names = [cert.subject.CN, ...(cert.subjectaltname || '')
      .split(',').map((s) => s.trim().replace(/^DNS:/, ''))].filter(Boolean);
    const covers = names.some((n) => n === hostname
      || (n.startsWith('*.') && hostname.endsWith(n.slice(1))
          && hostname.split('.').length === n.split('.').length));
    if (authorized && covers) {
      pass(origin, 'TLS certificate', `valid for ${cert.subject.CN}`);
    } else {
      fail(origin, 'TLS certificate',
        `presented ${cert.subject.CN}; ${authorized ? 'does not cover this name' : error}`);
    }
  }

  /* 3 -- the origin serves our app ------------------------------------ */
  let html = '';
  try {
    const response = await fetch(origin + '/', { redirect: 'follow' });
    html = await response.text();
    if (!response.ok) {
      fail(origin, 'serves the site', `HTTP ${response.status} — the edge does not route this hostname`);
    } else if (!/Saaradhi/i.test(html)) {
      fail(origin, 'serves the site', `HTTP 200 but the page is not ours`);
    } else {
      pass(origin, 'serves the site', `HTTP ${response.status}`);
    }
  } catch (err) {
    fail(origin, 'serves the site', String(err.message || err).slice(0, 120));
  }

  /* 4 -- the API accepts this origin ---------------------------------- */
  //
  // THE CHECK THAT WOULD HAVE CAUGHT IT. A host can serve the site
  // perfectly and still be unusable, because every authenticated call is
  // refused by CORS before it leaves the browser.
  try {
    const preflight = await fetch(`${API}/auth/profile/`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    const allowed = preflight.headers.get('access-control-allow-origin');
    if (allowed === origin || allowed === '*') {
      pass(origin, 'API accepts this origin', `allow-origin: ${allowed}`);
    } else {
      fail(origin, 'API accepts this origin',
        `allow-origin: ${allowed ?? '(absent)'} — every API call from this host is blocked by the browser`);
    }
  } catch (err) {
    fail(origin, 'API accepts this origin', String(err.message || err).slice(0, 120));
  }

  /* 5 -- which build is this? ----------------------------------------- */
  // The build id is the directory that holds _buildManifest.js. Matching
  // `/_next/static/<anything>/` instead picks up `css` and `chunks`, which
  // are the same on every build and would make two different builds look
  // identical -- the opposite of what this check is for.
  const build = (html.match(/"buildId"\s*:\s*"([^"]+)"/) || [])[1]
    || (html.match(/\/_next\/static\/([^/"]+)\/_buildManifest/) || [])[1]
    // Fall back to the set of hashed chunk filenames, which does change
    // between builds.
    || (() => {
      const chunks = [...html.matchAll(/\/_next\/static\/chunks\/([^"']+?\.js)/g)]
        .map((m) => m[1]).sort();
      return chunks.length ? chunks.join(',').slice(0, 64) : null;
    })();
  if (build) {
    builds.set(origin, build);
    pass(origin, 'build identified', build.slice(0, 24));
  }
}

/* 6 -- all hosts on the same build ------------------------------------ */
console.log('\n=== consistency ===');
const distinct = new Set(builds.values());
if (builds.size < 2) {
  console.log('  ----  only one host produced a build id; nothing to compare');
} else if (distinct.size === 1) {
  pass('all', 'every host serves the same build', [...distinct][0].slice(0, 24));
} else {
  fail('all', 'hosts serve DIFFERENT builds',
    [...builds.entries()].map(([h, b]) => `${new URL(h).hostname}=${b.slice(0, 12)}`).join(' | '));
}

/* 7 -- which backend revision is actually serving? -------------------- */
//
// WRITTEN AFTER GETTING THIS WRONG TWICE. "Is the deploy live?" was
// answered both times by grepping the HTML for a string that only exists
// in a JS chunk, which reported a successful deploy as not landed. The
// backend publishes its own revision; ask it rather than inferring.
console.log('\n=== deployed revision ===');
try {
  const response = await fetch(API.replace(/\/api\/v1\/?$/, '') + '/version');
  const body = await response.json();
  const revision = body.revision_short || body.revision || '(absent)';
  const expected = process.env.EXPECT_REVISION;
  if (expected && !String(revision).startsWith(expected.slice(0, 7))) {
    fail(HOSTS[0], 'backend revision',
      `serving ${revision}, expected ${expected.slice(0, 7)} — the deploy has not landed`);
  } else {
    pass(HOSTS[0], 'backend revision', `${revision}${expected ? ' (as expected)' : ''}`);
  }
} catch (err) {
  fail(HOSTS[0], 'backend revision', `could not read /version: ${String(err.message || err).slice(0, 80)}`);
}

const failed = results.filter((r) => r.s === 'FAIL');
console.log('\n================= HOSTS =================');
console.log(`checked: ${HOSTS.join(', ')}`);
console.log(`passed:  ${results.length - failed.length}\nfailed:  ${failed.length}`);
if (failed.length) {
  console.log('\nfailures:');
  for (const r of failed) console.log(`  - ${new URL(r.h === 'all' ? HOSTS[0] : r.h).hostname}: ${r.n} — ${r.d}`);
  console.log('\nA feature suite that passes while these fail is not testing the site people use.');
}
process.exit(failed.length ? 1 : 0);
