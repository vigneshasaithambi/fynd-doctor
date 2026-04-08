# Engineering Reference — Fynd CRO Doctor

One-pager for anyone returning to this codebase. Covers what each module does and the non-obvious architectural decisions behind it.

> **Looking for a fixed bug?** See [BUG_FIXES.md](BUG_FIXES.md) — chronological log of non-obvious bugs we've already debugged.

---

## What this app does

User pastes an e-commerce URL → headless Chrome crawls the funnel (Homepage → Category → PDP → Cart → Checkout) → measures perf locally → asks Claude for findings + a Vision audit against Baymard guidelines → renders a branded report with a Bucket 1 (Fix Now) / Bucket 2 (Platform Limited → Fynd advantage) split. Used as outbound sales material.

---

## External dependencies (the whole list)

| Dep | Where | Required? |
|---|---|---|
| **Anthropic Claude API** | [lib/services/claude.ts](../lib/services/claude.ts) | Optional — falls back to deterministic mocks |
| **Target e-commerce site** | Whatever URL the user submits | Yes — that's the input |

That's it. No PageSpeed Insights, no DB, no S3, no auth provider, no analytics, no telemetry, no queue. Single optional API key (`ANTHROPIC_API_KEY`).

---

## Architecture map

```
app/                                # Next.js 16 App Router
  page.tsx                          # Landing — URL input
  analyzing/[id]/page.tsx           # 9-step polling loader
  report/[id]/page.tsx              # Server-rendered report viewer
  api/
    analyze/route.ts                # POST → spawns crawl, returns {id}
    status/[id]/route.ts            # GET → current phase + step
    report/[id]/route.ts            # GET → report JSON
    pdf/[id]/route.ts               # GET → Puppeteer-printed A4 PDF
    screenshot/[id]/[name]/route.ts # GET → screenshot file from reports/{id}/

lib/
  crawler/                          # Puppeteer pipeline
    index.ts                        # Orchestrator — 9 phases, writes status.json
    browser.ts                      # Stealth Chrome launch + viewports
    homepage.ts                     # gotoSafe with timeout handling
    detectors.ts                    # Page detection (§3.2.1) + findProductUrls (§3.3 retry)
    addToCart.ts                    # Variant pre-select (§3.4) + ATC cascade (§3.3)
    checkout.ts                     # Form fill with test persona + scorecard math
    paymentDetector.ts              # 14-method scan (§5.6.5)
    domScraper.ts                   # SEO/trust/conversion DOM signals
    screenshot.ts                   # Desktop 1440 + mobile 375
    stickyDetector.ts               # §5.7 — sticky/persistent UI signals

  services/
    claude.ts                       # Anthropic SDK wrapper + mock fallback seeds
    pagespeed.ts                    # Lighthouse-lite entry point (PSI replacement)
    lighthouseLite/                 # In-house perf measurement
      measure.ts                    # CDP throttling + observer injection
      observer.ts                   # PerformanceObserver bootstrap (string)
      scrape.ts                     # DOM heuristics body (string, bundler-safe)
      score.ts                      # Log-normal Lighthouse v11 curves + checklists
    recommendations.ts              # Claude text → structured findings
    baymardAudit.ts                 # Claude Vision call w/ filtered guidelines
    scorer.ts                       # Weighted 6-category overall score
    pdf.ts                          # Puppeteer print of /report/[id]?print=1

  data/
    baymardGuidelines.ts            # Lazy loader (289 unique guidelines)
    baymard-scrape.jsonl            # 82 MB scrape (gitignored)

  prompts/
    croAnalysis.ts                  # CRO system prompt + Fynd advantages table (§8)
    baymardVision.ts                # Vision system prompt

  utils/
    selectors.ts                    # ATC + cart + checkout selector lists
    testPersona.ts                  # Dummy form data (Jane Smith)
    storage.ts                      # reports/{id}/ filesystem helpers
    validators.ts                   # URL normalize + domain extraction

  types.ts                          # Report, Finding, StickySignals, etc. (matches §7)

reports/{id}/                       # Generated artifacts (gitignored)
  status.json                       # Polled by loading screen
  report.json                       # Final output
  *.png                             # Desktop + mobile screenshots
```

---

## Crawl phase pipeline ([lib/crawler/index.ts](../lib/crawler/index.ts))

Each phase calls `writeStatus(phase)` so the loading screen can poll `/api/status/[id]`.

| # | Phase | What it does | Key fns |
|---|---|---|---|
| 0 | Loading homepage | `gotoSafe()` desktop + mobile, screenshot, DOM scrape | `gotoSafe`, `scrapeDom`, `captureBoth` |
| 1 | Crawling category | Pick category link from homepage nav | `findCategoryUrl` |
| 2 | Inspecting PDP | **Collect up to 3 product candidates and try ATC against each in turn**. Break on first success. Re-screenshot the PDP that actually flowed through. | `findProductUrls`, `isPdp`, `preselectVariants`, `clickAddToCart` |
| 3 | Walking cart | Only runs if ATC succeeded above | `findCartUrl` |
| 4 | Analyzing checkout | Detect type + steps, fill with test persona, **never click Place Order** | `fillCheckoutForms`, `buildCheckoutScorecard` |
| 5 | Running Lighthouse-lite | Mobile + desktop perf for homepage / PDP / checkout | `runPageSpeed` → `lighthouseLite/measure` |
| 6 | Sticky detection (§5.7) | Re-navigate to each reached page, scan for sticky/persistent UI patterns | `detectSticky` |
| 7 | Claude analysis | Text findings (5 categories) + Vision Baymard audit per page | `analyzePage`, `baymardAudit` |
| 8 | Generating report | Score, bucket-split, exec summary, write `report.json` | `scoreReport`, `buildExecSummary` |

---

## Key design decisions

### 1. Lighthouse-lite instead of PSI ([lib/services/lighthouseLite/](../lib/services/lighthouseLite/))

Reuses the same Puppeteer browser to measure perf locally. Applies CDP throttling that mirrors Lighthouse 11 presets (Slow 4G + 4× CPU mobile, fast desktop), injects a `PerformanceObserver` bootstrap before navigation to capture LCP / CLS / FCP / TTFB / longtask total, then converts via the Lighthouse log-normal score curves with the same v11 category weights (FCP 10 / LCP 25 / TBT 30 / CLS 25 / SI 10).

**Why:** zero external API dependencies, no rate limits, no API key, no cost. Real Lighthouse would be 200+ MB and slow; PSI was an HTTP call to Google. Lighthouse-lite scores within ~15 points of real Lighthouse on the same URL.

**Limits:**
- INP can't be measured headlessly without scripted interaction → synthesised from TBT + 100 ms.
- Speed Index approximated from FCP + 0.6 × (LCP − FCP), no filmstrip.
- Color contrast skipped (would need axe-core, too heavy).

### 2. Mock-first design for demos

Both `claude.ts` and `pagespeed.ts` (mock fallback only) detect missing API keys / measurement failures and return **deterministic** seeded data so the entire pipeline runs end-to-end without any external service. The mock seeds in [lib/services/claude.ts](../lib/services/claude.ts) are page-type aware so the report still looks plausible during a no-key demo.

Real Claude is enabled the moment you put `ANTHROPIC_API_KEY` in `.env.local` — no code change.

### 3. Baymard guideline loader ([lib/data/baymardGuidelines.ts](../lib/data/baymardGuidelines.ts))

Lazy-parses an 82 MB JSON scrape (`baymard-scrape.jsonl`, gitignored) into 289 unique guidelines bucketed by page type via title-breadcrumb keyword matching, capped at 40/page for Vision call efficiency. Falls back to a built-in ~50-entry stub if the scrape file is missing (CI / fresh clone).

The scrape has titles in `#NNN: Statement – Topic – Collection – ...` format, which the loader regex-extracts. If the scrape format ever changes, update `parseScrape()` and `bucketFor()`.

### 4. ATC retry across 3 products (§3.3)

PDPs fail for many reasons: out of stock, unsupported variant, blocked by bot detection, ATC button hidden behind a modal. The crawler now collects up to 3 candidate PDPs from the category page in [detectors.ts](../lib/crawler/detectors.ts) `findProductUrls()` and walks them in [crawler/index.ts](../lib/crawler/index.ts) Phase 2 until one ATC click registers. The PDP report shows whichever product actually flowed through to cart, and `notes` records `"Reached cart after trying 2 products"` so it's visible in the report.

### 5. Sticky/persistent UI scan (§5.7)

[lib/crawler/stickyDetector.ts](../lib/crawler/stickyDetector.ts) is a separate phase that re-navigates to each reached page, scrolls 800 px, then checks `getComputedStyle().position === 'fixed' || === 'sticky'` for the elements that matter for CRO: header, cart icon, primary CTA, filter rail, checkout CTA. Walks 5 ancestors deep because sticky often lives on a wrapper div. Results land in `PageReport.sticky` and feed into the Claude prompt so the model can author findings against real DOM facts instead of guessing from screenshots.

### 6. Scoring ([lib/services/scorer.ts](../lib/services/scorer.ts))

6 categories, weights sum to 1.0:

| Category | Weight | Source |
|---|---|---|
| performance | 0.18 | Lighthouse-lite avg across pages |
| mobile | 0.12 | Findings + Lighthouse-lite mobile delta |
| seo | 0.12 | Lighthouse-lite SEO checklist + DOM signals |
| conversion | 0.18 | Findings (heaviest finding-driven category) |
| technical | 0.12 | Findings (best-practices DOM checks) |
| **baymardUx** | **0.28** | Vision audit findings (heaviest category overall) |

Vision/baymardUx is the heaviest weight on purpose — it's the most differentiated signal vs every other crawler tool.

---

## Dev workflow

```bash
# Install
npm install

# Dev server
npm run dev               # localhost:3000

# Typecheck
npx tsc --noEmit

# Quick smoke (no API keys needed — uses mocks for Claude)
curl -X POST localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.example.com"}'

# Poll status
curl localhost:3000/api/status/<id>

# Final report
curl localhost:3000/api/report/<id>
```

A clean run on a real e-commerce site takes ~60–120 s (Slow 4G throttling on lighthouse-lite is the main time cost). example.com runs in ~20 s because there's no funnel beyond the homepage.

---

## File-level cheatsheet

| If you want to … | Edit this |
|---|---|
| Change a category weight or scoring curve | [lib/services/scorer.ts](../lib/services/scorer.ts) |
| Add a payment method to the 14-detector | [lib/crawler/paymentDetector.ts](../lib/crawler/paymentDetector.ts) |
| Tune the Claude system prompt or Fynd advantages | [lib/prompts/croAnalysis.ts](../lib/prompts/croAnalysis.ts) |
| Add a new sticky element to scan | [lib/crawler/stickyDetector.ts](../lib/crawler/stickyDetector.ts) → `STICKY_JS` |
| Add a new ATC selector | [lib/utils/selectors.ts](../lib/utils/selectors.ts) → `ATC_SELECTORS` / `ATC_TEXT_PATTERNS` |
| Change Lighthouse-lite throttling profile | [lib/services/lighthouseLite/measure.ts](../lib/services/lighthouseLite/measure.ts) → `MOBILE_THROTTLE` / `DESKTOP_THROTTLE` |
| Add a new report section | `app/report/[id]/page.tsx` + new component under `app/components/` |
| Add a new crawl phase | [lib/crawler/index.ts](../lib/crawler/index.ts) `STEPS` array + matching label in [app/analyzing/[id]/page.tsx](../app/analyzing/[id]/page.tsx) |

---

## Deferred / known gaps

- **§9 listing pages** — brand / collection / search listing page types not crawled.
- **Share links + 30-day expiry** — reports live on local disk only.
- **PDF cover page polish** — current PDF is just the report viewer printed.
- **Annotated screenshot markers** — Vision findings don't draw arrows on the screenshots.
- **Rate limiting / concurrent crawl orchestration** — one crawl at a time, no queue.
- **Real INP** — synthesised from TBT (real INP needs scripted interaction).
- **Color contrast a11y check** — would need axe-core (~3 MB).

If any of these become important, the audit + remediation plan format in `~/.claude/plans/lazy-snacking-reef.md` is the template to follow.
