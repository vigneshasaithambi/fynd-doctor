# Testing — How to Run

The Fynd CRO Doctor test suite covers six layers. Run them individually for fast feedback or all together with `npm run test:all`.

## One-time setup

```bash
# 1. Install npm devDeps (already done if you ran `npm install`)
npm install

# 2. Install Playwright browser binaries (~300 MB, one-time)
npx playwright install chromium firefox webkit

# 3. Install k6 for load tests (single Go binary, no service)
brew install k6
# OR download a binary from https://k6.io/docs/get-started/installation/
```

## The test catalogue

| Layer | Command | Count | Time |
|---|---|---|---|
| **Unit** (pure functions, mocked deps) | `npm test` | 89 cases / 11 files | ~8 s |
| **Integration** (real Puppeteer, fixture HTML) | included in `npm test` | 26 cases / 5 files | ~4 min |
| **API routes** (handlers called directly, no Next dev server) | included in `npm test` | 25 cases / 5 files | ~1 s |
| **E2E** (Playwright vs `npm run dev`) | `npm run test:e2e` | 17 cases / 4 specs | ~45 s |
| **Visual regression** (Playwright `toHaveScreenshot`) | folded into E2E | 10 baselines | included |
| **Accessibility** (axe-core) | `npm run test:a11y` | 9 cases | ~35 s |
| **Cross-browser** (Chromium + Firefox + WebKit) | `npm run test:e2e` (3 projects auto-selected) | 51 (17 × 3) | ~2 min |
| **Mutation** (Stryker on critical files) | `npm run test:mutation` | 4 modules | ~3 min |
| **Load** (k6 burst + storm + cache + mixed) | `npm run test:load` | 4 scripts | ~10 min |

## Day-to-day

```bash
# Watch mode while editing source
npm run test:watch

# Targeted run
npx vitest run tests/unit/scorer.test.ts

# Coverage (HTML report under coverage/)
npm run test:coverage
```

## E2E commands

```bash
# All E2E (auto-spawns dev server, runs against Chromium + Firefox + WebKit)
npm run test:e2e

# Single browser only
npx playwright test --project=chromium

# Update visual baselines after an intentional UI change
npm run test:e2e:update

# Just the a11y suite
npm run test:a11y
```

## Mutation testing

Stryker mutates the source of four critical files (scorer, lighthouse-lite score, rate limiter, queue) and re-runs the unit tests. If a mutation survives, that's a coverage gap.

```bash
npm run test:mutation
```

Reports land in `reports/mutation/index.html`. Thresholds:

| File | Required mutation score |
|---|---|
| `lib/services/scorer.ts` | ≥ 80% |
| `lib/services/lighthouseLite/score.ts` | ≥ 80% |
| `lib/utils/rateLimit.ts` | ≥ 90% |
| `lib/crawler/queue.ts` | ≥ 90% |

Stryker is **not** part of `npm run test:all` — it's slower and meant for `main` merges and weekly cron.

## Load testing

```bash
# Start the dev server in one shell
npm run dev

# Run all 4 k6 scripts in another shell
npm run test:load

# Or one at a time
k6 run tests/load/analyze-burst.js
k6 run -e ID=fixture-report-id tests/load/status-poll-storm.js
k6 run -e ID=fixture-report-id tests/load/pdf-cache.js
k6 run -e ID=fixture-report-id tests/load/mixed.js
```

| Script | What it validates | SLO |
|---|---|---|
| `analyze-burst.js` | 50 VUs hammer POST /api/analyze for 60 s | p99 < 500 ms; no 5xx; rate limiter returns 429 |
| `status-poll-storm.js` | 200 VUs poll status at 1.5 s for 60 s | Zero JSON parse errors, zero 5xx (validates atomic-write) |
| `pdf-cache.js` | 100 VUs request the same cached PDF | Avg < 200 ms after warmup (validates disk cache) |
| `mixed.js` | Realistic burst: 5 analyze/min + 100 status/sec + 10 pdf/min + 50 report/min for 5 min | http_req_failed < 5%, p95 < 800 ms |

## What each layer is for

- **Unit**: catch math/logic regressions in milliseconds. Fastest feedback loop.
- **Integration**: catch real Puppeteer/CDP/DOM-eval bugs. Slow but high signal — these caught the `__name is not defined` bug.
- **API**: catch route-level regressions (status codes, headers, rate limits, error UX). Run inline with unit because they import the handler directly — no dev server.
- **E2E**: catch real-browser bugs and visual regressions. Auto-spawns the dev server.
- **a11y**: catch WCAG 2.1 AA violations. Found and forced the fix for the original `text-zinc-500` contrast issue.
- **Mutation**: catch test coverage gaps. If a mutation survives, your tests aren't strict enough.
- **Load**: catch concurrency/contention bugs that only surface under burst. Validates the scale-readiness fixes.

## Coverage targets (enforced via `npm run test:coverage`)

| Path | Required line coverage |
|---|---|
| `lib/**` (overall) | ≥ 70% |
| `lib/utils/storage.ts` | ≥ 90% |
| `lib/crawler/queue.ts` | ≥ 90% |
| `lib/utils/rateLimit.ts` | ≥ 90% |

## CI hookup (when you're ready)

```yaml
# .github/workflows/test.yml (template)
- run: npm ci
- run: npx playwright install --with-deps
- run: npm test
- run: npm run test:e2e
# Mutation + load run on main only:
- run: npm run test:mutation
  if: github.ref == 'refs/heads/main'
```

`npm run test:load` should run against a deployed staging environment, not in CI — k6 needs a stable base URL.

## Troubleshooting

- **Vitest "happy-dom not found"** → `npm install --save-dev happy-dom@^15` (already in package.json).
- **Playwright "browser not installed"** → `npx playwright install chromium firefox webkit`.
- **Visual snapshot mismatch on a fresh machine** → `npm run test:e2e:update` to regenerate baselines (only do this for legitimate UI changes).
- **k6 not found** → `brew install k6` or download single binary.
- **a11y test failures after a UI change** → run with `--reporter=line` to see the exact axe rule + element. Most fixes are `text-zinc-500 → text-zinc-400` style contrast bumps.

## Bug fixes the test suite caught while being written

1. **Path traversal in `/api/screenshot/[id]/[name]`** — caught by API test #134. Fixed in [app/api/screenshot/[id]/[name]/route.ts](../app/api/screenshot/[id]/[name]/route.ts) with a SAFE_NAME regex + path resolution check.
2. **WCAG color contrast violations** on `text-zinc-500` against dark backgrounds — caught by a11y test #197. Fixed by bulk renaming `text-zinc-500` → `text-zinc-400` across 8 files.
3. **Missing form label** on the landing page URL input — caught by a11y test #202. Fixed by adding `<label htmlFor="cro-url-input" className="sr-only">` and `aria-label`.

These are documented in [BUG_FIXES.md](BUG_FIXES.md) under future entries.
