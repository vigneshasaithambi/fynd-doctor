# Bug Fixes Log

Chronological log of non-obvious bugs we hit during development and how we fixed them. Each entry exists so the next engineer (or future you) doesn't burn cycles re-debugging the same symptom. Architectural decisions live in [ENGINEERING.md](ENGINEERING.md), not here.

Format per entry: **symptom → root cause → fix → why it's not obvious from the symptom alone**.

---

## #1 — `__name is not defined` inside `page.evaluate`

**Symptom**
- Lighthouse-lite measurement returned `mocked: true` for every URL even though `runPageSpeed()` ran without an obvious error.
- Server log showed `[pagespeed] local measurement failed for <url>: __name is not defined`.
- Worked when invoked from a plain Node script via `tsx`, **failed identically** under both `tsx` and Next's Turbopack.

**Root cause**
When you write `page.evaluate(() => { ... })` in TypeScript, esbuild (used by both `tsx` and Turbopack) injects helper code into the function body for class-name preservation:

```js
var __name = (fn, name) => Object.defineProperty(fn, 'name', { value: name, ... });
```

Puppeteer serializes the function via `Function.prototype.toString()` and ships the source to the headless Chrome page. The `__name` reference travels with it, but the helper definition does not — it lives in the Node bundle. Chrome throws `__name is not defined` the moment the evaluate runs. Our `try/catch` swallowed it and fell through to `mockResult()`, so the report still rendered with seeded numbers and nobody noticed unless they checked the `mocked` flag.

**Fix**
Move the evaluate body into its own file as a raw template-string export and pass the string to `page.evaluate(STRING)`. esbuild leaves template strings alone, so no helper injection happens.

Three files use this pattern:
- [lib/services/lighthouseLite/observer.ts](../lib/services/lighthouseLite/observer.ts) — `OBSERVER_BOOTSTRAP`
- [lib/services/lighthouseLite/scrape.ts](../lib/services/lighthouseLite/scrape.ts) — `SCRAPE_JS`
- [lib/crawler/stickyDetector.ts](../lib/crawler/stickyDetector.ts) — `STICKY_JS`

**Why it's not obvious from the symptom**
The error message points at `__name`, a symbol that doesn't appear anywhere in the source code. There's no stack trace beyond `page.evaluate`. The function looks completely normal in your editor. You only find it by:
1. Knowing esbuild does class-name preservation, OR
2. Logging the actual stringified function source after it leaves your code, OR
3. Reading this entry.

**Rule of thumb**
If you write a new `page.evaluate` body and it inexplicably falls through to a fallback in production but seems fine locally, **check whether the evaluate body is a function or a string**. Convert to string.

---

## #2 — `utils.typeOf is not a function` from `puppeteer-extra-plugin-stealth`

**Symptom**
- Every `POST /api/analyze` request returned a 500 with this stack:
  ```
  TypeError: utils.typeOf is not a function
    at cloneDeep
    at mergeDeep
    at new PuppeteerExtraPlugin
    at new StealthPlugin
    at lib/crawler/browser.ts (module load)
  ```
- The crawler module never finished loading, so the entire crawl pipeline was dead **inside Next** even though the same code worked fine in plain Node (`tsx lh-test.mts`).
- Pre-existed the lighthouse-lite work — first surfaced when I tried to test the new perf code end-to-end through the Next API.

**Root cause**
Next bundles every package imported by a server route through Turbopack (or webpack on the build command). It maintains an [auto-externalized package list](../node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md) of packages known to break under bundling — they're loaded via native `require()` instead. **`puppeteer` is on that list. `puppeteer-extra` and `puppeteer-extra-plugin-stealth` are not.**

The stealth plugin uses `merge-deep`, which uses `clone-deep`, which uses an internal `utils` module. Something about how Turbopack rewrites that CJS chain mangles the `utils` export shape so `utils.typeOf` becomes `undefined`. Module load throws before any request can be served.

**Fix**
Declare both packages as external in [next.config.ts](../next.config.ts):

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: [
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
  ],
};
```

Verified by running a real crawl (`https://www.example.com` and `https://shop.tesla.com`) end-to-end through `/api/analyze` after the change.

**Why it's not obvious from the symptom**
- `utils.typeOf` is buried inside a transitive dep of a transitive dep — three levels removed from anything you imported by name.
- The same code works in plain Node, so it looks like a runtime bug, not a bundler bug.
- The fix is in `next.config.ts`, a file you'd never edit while debugging the crawler.

**Rule of thumb**
If you ever add another puppeteer plugin (`puppeteer-extra-plugin-recaptcha`, `-anonymize-ua`, etc.) **add it to `serverExternalPackages` immediately**. Don't wait for the next 500.

---

---

## #3 — Path traversal in `/api/screenshot/[id]/[name]`

**Symptom**
- The screenshot route accepted any value for `[name]` and passed it directly to `path.join(reportDir(id), "screenshots", name)`. A request like `GET /api/screenshot/<id>/../../etc/passwd` would resolve to a file outside the report directory and serve its bytes back as `image/png`.
- Found by API test #134 (`tests/api/screenshot.test.ts`) — the test asserted a 400 response for a `..` filename, and the original implementation returned 200 with whatever the resolved path pointed to.

**Root cause**
No filename validation. `path.join` collapses `..` segments without ever leaving the host filesystem.

**Fix**
Two layers of defense in [app/api/screenshot/[id]/[name]/route.ts](../app/api/screenshot/[id]/[name]/route.ts):
1. A `SAFE_NAME` regex `^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$` that rejects anything with slashes, `..`, or no image extension.
2. A `path.resolve` check that confirms the final path stays inside `reportDir(id)`.

Both layers run before `fs.existsSync` so the disk is never even probed for an invalid name.

**Why it's not obvious from the symptom**
The route returns image data on a successful path, so casual testing wouldn't notice anything wrong — you'd just get `Cache-Control: public, max-age=3600` headers on the wrong file. Path traversal vulnerabilities are silent until exploited.

**Rule of thumb**
Any time a path is constructed from a user-supplied URL segment, **validate the segment with a strict allowlist regex** AND **resolve+compare the final path against the expected parent directory**. Do both. Belt and braces.

---

## #4 — WCAG 2.1 AA color contrast on `text-zinc-500` against dark backgrounds

**Symptom**
- The `text-zinc-500` (#71717b) class against `bg-zinc-900` / `bg-zinc-950` produced contrast ratios of 3.96–4.12, below the AA threshold of 4.5:1.
- Used in 8 files: landing page, analyzing page, report viewer, ScoreRing, CategoryBars, IssueCard, BucketSummary, CheckoutScorecard, PageTabs.
- Found by a11y test #197 (`tests/e2e/a11y.spec.ts`) — `@axe-core/playwright` flagged 18 `color-contrast` violations on the report viewer alone.

**Root cause**
Tailwind's `zinc-500` is a fine *visual* mid-grey but its luminance is too close to dark backgrounds for AA. The original UI was eyeballed against the design, not measured.

**Fix**
Bulk replace `text-zinc-500` → `text-zinc-400` (#a1a1aa, ratio ~7:1) and `text-zinc-600` → `text-zinc-400` across all 8 files. Visual baselines were re-captured with `npm run test:e2e:update`.

**Why it's not obvious from the symptom**
The text was *legible*. It looked subtle by design. Without an automated tool measuring the actual ratios, the violation is invisible to anyone who isn't running axe. This is exactly the failure mode WCAG was designed to catch.

**Rule of thumb**
Any text color on a dark background needs a measured contrast ratio. **Never trust your eyes** — run axe. The fix is almost always one Tailwind shade brighter (e.g. zinc-500 → zinc-400, zinc-400 → zinc-300).

---

## #5 — Landing page URL input had no label (a11y)

**Symptom**
- Axe rule `label` flagged the URL input on `app/page.tsx`. The `<input>` had a `placeholder` but no `<label>` and no `aria-label`. Screen readers had nothing to announce.
- Found by a11y test #202 (`tests/e2e/a11y.spec.ts`).

**Root cause**
Placeholder text isn't a label. It disappears when the user starts typing and isn't read by every assistive tech.

**Fix**
Added a visually-hidden `<label htmlFor="cro-url-input" className="sr-only">` plus `aria-label="Website URL to analyze"` directly on the input in [app/page.tsx](../app/page.tsx). Also bumped `type="text"` → `type="url"` and added `inputMode="url"` for better mobile keyboards.

**Why it's not obvious from the symptom**
Sighted users can read the placeholder fine, so manual QA never catches it. Only automated a11y scanners and screen-reader users surface the gap.

**Rule of thumb**
Every form input needs a label — visible OR `sr-only`. Placeholders are decoration, not labels.

---

## How to add a new entry

When you fix a non-obvious bug:

1. Add a new section at the **bottom** of this file (newest last).
2. Use the heading `## #N — <one-line symptom>`.
3. Include the four bold subsections: **Symptom**, **Root cause**, **Fix**, **Why it's not obvious from the symptom**.
4. Cite the affected files with markdown links.
5. End with a one-line **Rule of thumb** if the fix generalizes.

Don't log every bug — only the ones where the symptom alone wouldn't lead a fresh debugger to the cause within ~30 minutes.
