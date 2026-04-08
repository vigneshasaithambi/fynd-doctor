# Fynd CRO Doctor

MVP of a CRO Report Generator. Crawls an e-commerce URL through Homepage → Category → PDP → Cart → Checkout, runs Claude + PageSpeed analysis, scores it against Baymard guidelines, and renders a branded report.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open http://localhost:3000 and paste any e-commerce URL.

## API keys (optional)

The only external API is Anthropic Claude. The app runs end-to-end without it using deterministic mock findings, so you can demo the pipeline immediately. To enable real Claude analysis, copy `.env.local.example` to `.env.local` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
BASE_URL=http://localhost:3000   # used by the PDF route
```

Performance / Core Web Vitals are measured **locally** by `lib/services/lighthouseLite/` (Puppeteer + CDP throttling + log-normal scoring curves) — no Google PageSpeed Insights dependency.

## In scope (MVP)

- 5-page funnel crawl with Puppeteer + stealth
- Desktop (1440) + mobile (375) screenshots
- Page detection per spec §3.2.1
- Add to Cart cascade per spec §3.3 + variant pre-selection §3.4
- Checkout form fill with test persona — never clicks Place Order
- Payment method detection (14 methods, spec §5.6.5)
- Local Lighthouse-lite perf measurement (Puppeteer + CDP throttling) for homepage / PDP / checkout
- Claude text analysis + Vision Baymard audit per page
- 6-category scoring (MVP weights, spec §6.2 reweighted to drop 5.7)
- Bucket 1 (Fix Now) vs Bucket 2 (Platform Limited) classification with Fynd advantages
- Loading screen with 9 phases polling /api/status
- Report viewer with score ring, category bars, checkout scorecard, page tabs, issue cards, bucket summary, CTA
- PDF export (`/api/pdf/[id]`) via headless Chrome against `/report/[id]?print=1`

## Out of scope (deferred)

- Brand / collection / search listing pages (spec §5.9.1–5.9.6)
- Section 5.7 sticky/persistent UI pattern checks (partially via Vision)
- Share links + 30-day expiry storage
- PDF cover-page polish, annotated screenshot markers
- Rate limiting, concurrent crawl orchestration
- Full 204 Baymard guideline DB (ships ~50 representative)

## Smoke test

```
URL → https://www.allbirds.com
```

Should crawl 5 pages, detect a handful of payment methods, return a complete report in ~60–90s.
