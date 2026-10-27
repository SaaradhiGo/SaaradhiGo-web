# Verification scripts

These drive the real screens in a real browser against a deployed site.
They exist so nobody has to take a report on trust: run them yourself,
against whatever host you actually use.

```
npm run verify:hosts          # run this FIRST
npm run verify:auth
npm run verify:booking
npm run verify:driver-docs
npm run verify:site
```

Every script defaults to `https://qa.saaradhigo.com`. Override with `SITE`:

```
SITE=https://www.qa.saaradhigo.com npm run verify:auth
```

Screenshots are written to `.verify-out/` (gitignored). Each script exits
non-zero if anything failed, so they can gate a deploy.

## Run `verify:hosts` first, always

A round of QA was once reported as "19/19 passing" while every page the
owner opened was broken. The checks ran against `www.qa.saaradhigo.com`;
the owner used `qa.saaradhigo.com`. The backend's CORS allowlist contained
only the first, so every API call from the second was blocked by the
browser before it left. Both facts were true at once, and no feature test
noticed the other host existed.

`verify:hosts` checks the hostnames themselves — DNS, whether the TLS
certificate actually covers that name, whether the edge routes it to our
app, whether the API accepts that origin for CORS, and whether every host
serves the same build.

**A green feature suite on one host proves nothing about another.** If
`verify:hosts` fails, the other results are not about the site people are
using.

## Confirming a deploy landed

```
EXPECT_REVISION=<sha> npm run verify:hosts
```

The backend publishes its own revision at `/version`. Ask it. I twice
answered "is the deploy live?" by grepping the page HTML for a string that
only exists in a JS chunk, and twice reported a successful deploy as not
landed.

## What each one covers

| Script | Proves |
|---|---|
| `verify:hosts` | every public hostname resolves, is served, is trusted, and is allowed by the API; and which backend revision is live |
| `verify:auth` | sign-up on one screen, sign-in for rider/driver/operator, the account menu and `/account`, a rider refused at the operator console |
| `verify:booking` | place search, fares appearing unprompted, confirm without an account, guest booking end to end |
| `verify:driver-docs` | a new driver uploads a real file and the server's own checklist changes as a result |
| `verify:site` | 9 routes × 5 locales × 5 widths: headings, axe-core, overflow, untranslated strings |
| `verify:scope` | the console as several operators: region shown, nav drawn, rows listed, contact masking |
| `shoot:console` | photographs the console's sign-in states, shell and first pages in both themes at 1440 and 1024 |
| `a11y:console` | Lighthouse accessibility on sign-in and the Command Centre, both themes (needs `LIGHTHOUSE_DIR`) |

## They create real data

`verify:auth` and `verify:driver-docs` register accounts. `verify:booking`
with `BOOK_FOR_REAL=1` dispatches a real trip and then cancels it — if the
cancel step fails it says so loudly, because a test that leaves a live
request on the board is one somebody else has to clean up.

**Point them at QA, never at production.**

## Secrets

Passwords come from the environment, never from these files:

```
ADMIN_PASSWORD=…  RIDER_PASSWORD=…  DRIVER_PASSWORD=…  npm run verify:auth
```

They are the `QA_*_BOOTSTRAP_PASSWORD` variables on the backend service.
A check whose credentials are missing is reported as SKIPPED, never as
passed.

## Requirements

`playwright-core` (a devDependency) driving your installed Google Chrome —
no browser download. The driver-document fixture is generated on first run
and is labelled **QA TEST FIXTURE** on its face, so it can never be
mistaken for a real licence in a review queue.
