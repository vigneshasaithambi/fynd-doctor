import type { Browser } from "puppeteer";
import { launchBrowser, newDesktopPage, newMobilePage } from "./browser";
import { gotoSafe } from "./homepage";
import { captureBoth } from "./screenshot";
import { scrapeDom } from "./domScraper";
import { findCategoryUrl, findProductUrls, isPdp, findCartUrl, findCheckoutUrl } from "./detectors";
import { preselectVariants, clickAddToCart } from "./addToCart";
import { detectSticky } from "./stickyDetector";
import { fillCheckoutForms, buildCheckoutScorecard } from "./checkout";
import { runPageSpeed } from "../services/pagespeed";
import { analyzePage } from "../services/recommendations";
import { baymardAudit } from "../services/baymardAudit";
import { scoreReport } from "../services/scorer";
import { writeStatus, writeReport, screenshotPath, ensureReportDir } from "../utils/storage";
import type { PageReport, Report, PageType, Finding, BucketSummary } from "../types";
import { getDomain } from "../utils/validators";
import { startReportCleanup } from "../utils/cleanupReports";

// Boot the TTL cleanup loop the first time anything imports the crawler
// (scale plan Step 5). Idempotent — safe to call multiple times.
startReportCleanup();

const STEPS = [
  "Loading homepage",
  "Crawling category pages",
  "Inspecting product pages",
  "Walking through cart",
  "Analyzing checkout flow",
  "Running PageSpeed audits",
  "Capturing screenshots",
  "Running Claude analysis",
  "Generating report",
];

export async function runCrawl(reportId: string, url: string): Promise<void> {
  ensureReportDir(reportId);
  const domain = getDomain(url);
  const updated = (phase: number, done = false, error?: string) =>
    writeStatus(reportId, {
      id: reportId,
      phase,
      step: STEPS[Math.min(phase, STEPS.length - 1)],
      done,
      error,
      updatedAt: new Date().toISOString(),
    });

  updated(0);
  let browser: Browser | null = null;
  const pages: PageReport[] = [];
  let scorecard: Report["checkoutScorecard"];

  try {
    browser = await launchBrowser();
    const desktop = await newDesktopPage(browser);
    const mobile = await newMobilePage(browser);

    // Phase 0 — Homepage
    updated(0);
    const homeOk = await gotoSafe(desktop, url);
    await gotoSafe(mobile, url);
    const homeScreens = await captureBoth(desktop, mobile, reportId, "homepage");
    const homeDom = homeOk ? await scrapeDom(desktop) : null;
    pages.push({
      pageType: "homepage",
      url,
      reached: homeOk,
      screenshots: homeScreens,
      findings: [],
      notes: homeOk ? [] : ["Homepage failed to load"],
    });

    // Phase 1 — Category
    updated(1);
    const catUrl = homeOk ? await findCategoryUrl(desktop) : null;
    let catReached = false;
    let catScreens: { desktop?: string; mobile?: string } = {};
    if (catUrl) {
      catReached = await gotoSafe(desktop, catUrl);
      await gotoSafe(mobile, catUrl);
      if (catReached) catScreens = await captureBoth(desktop, mobile, reportId, "category");
    }
    pages.push({
      pageType: "category",
      url: catUrl,
      reached: catReached,
      screenshots: catScreens,
      findings: [],
      notes: catUrl ? [] : ["Could not detect a category page"],
    });

    // Phase 2 — PDP (spec §3.3 — collect up to 3 candidate products and try
    // ATC against each in turn; break on first success).
    updated(2);
    const pdpCandidates = catReached ? await findProductUrls(desktop, 3) : [];
    let pdpUrl: string | null = null;
    let pdpReached = false;
    let pdpScreens: { desktop?: string; mobile?: string } = {};
    let atcSuccess = false;
    let atcAttempts = 0;
    let lastAtcReason = "no PDP candidates found on category page";
    const pdpNotes: string[] = [];

    for (const candidate of pdpCandidates) {
      atcAttempts += 1;
      const navOk = await gotoSafe(desktop, candidate);
      await gotoSafe(mobile, candidate);
      if (!navOk) {
        lastAtcReason = "PDP navigation failed";
        continue;
      }
      if (!(await isPdp(desktop))) {
        lastAtcReason = "page did not look like a PDP";
        continue;
      }
      // First successful PDP load — record it and grab screenshots once.
      if (!pdpUrl) {
        pdpUrl = candidate;
        pdpReached = true;
        pdpScreens = await captureBoth(desktop, mobile, reportId, "pdp");
      }
      await preselectVariants(desktop);
      if (await clickAddToCart(desktop)) {
        atcSuccess = true;
        // Re-screenshot the successful PDP if it wasn't the first one (so the
        // report shows the product that actually flowed through to cart).
        if (candidate !== pdpUrl) {
          pdpUrl = candidate;
          pdpScreens = await captureBoth(desktop, mobile, reportId, "pdp");
        }
        break;
      }
      lastAtcReason = "Add to Cart click did not register";
    }

    if (atcAttempts === 0) {
      pdpNotes.push("Could not detect a product page");
    } else if (!atcSuccess) {
      pdpNotes.push(
        `Tried ${atcAttempts} product${atcAttempts > 1 ? "s" : ""}; ATC failed (${lastAtcReason})`,
      );
    } else if (atcAttempts > 1) {
      pdpNotes.push(`Reached cart after trying ${atcAttempts} products`);
    }

    pages.push({
      pageType: "pdp",
      url: pdpUrl,
      reached: pdpReached,
      screenshots: pdpScreens,
      findings: [],
      notes: pdpNotes,
    });

    // Phase 3 — Cart (navigate to cart only if ATC actually succeeded above)
    updated(3);
    let cartReached = false;
    let cartScreens: { desktop?: string; mobile?: string } = {};
    let cartUrl: string | null = null;
    if (atcSuccess) {
      await new Promise((r) => setTimeout(r, 1500));
      cartUrl = await findCartUrl(desktop, url);
      if (cartUrl) {
        cartReached = await gotoSafe(desktop, cartUrl);
        await gotoSafe(mobile, cartUrl);
        if (cartReached) cartScreens = await captureBoth(desktop, mobile, reportId, "cart");
      }
    }
    pages.push({
      pageType: "cart",
      url: cartUrl,
      reached: cartReached,
      screenshots: cartScreens,
      findings: [],
      notes: cartReached
        ? []
        : atcSuccess
          ? ["Cart page unreachable or blocked"]
          : ["Cart skipped — ATC never succeeded"],
    });

    // Phase 4 — Checkout
    updated(4);
    let checkoutReached = false;
    let checkoutScreens: { desktop?: string; mobile?: string } = {};
    let checkoutUrl: string | null = null;
    if (cartReached) {
      checkoutUrl = await findCheckoutUrl(desktop, url);
      if (checkoutUrl) {
        checkoutReached = await gotoSafe(desktop, checkoutUrl);
        await gotoSafe(mobile, checkoutUrl);
        if (checkoutReached) {
          checkoutScreens = await captureBoth(desktop, mobile, reportId, "checkout");
          await fillCheckoutForms(desktop);
          scorecard = await buildCheckoutScorecard(desktop);
        }
      }
    }
    pages.push({
      pageType: "checkout",
      url: checkoutUrl,
      reached: checkoutReached,
      screenshots: checkoutScreens,
      findings: [],
      notes: checkoutReached ? ["Test persona used; Place Order never clicked"] : ["Checkout unreachable"],
    });

    // Phase 5 — PageSpeed (homepage, PDP, checkout)
    updated(5);
    const psiTargets: Array<{ pageType: PageType; url: string | null }> = [
      { pageType: "homepage", url },
      { pageType: "pdp", url: pdpUrl },
      { pageType: "checkout", url: checkoutUrl },
    ];
    for (const t of psiTargets) {
      if (!t.url) continue;
      const page = pages.find((p) => p.pageType === t.pageType);
      if (!page) continue;
      const [m, d] = await Promise.all([
        runPageSpeed(browser, t.url, "mobile"),
        runPageSpeed(browser, t.url, "desktop"),
      ]);
      page.pageSpeed = { mobile: m, desktop: d };
    }

    // Phase 6 — Screenshots already captured. Reuse this slot to run the
    // sticky/persistent UI scan (spec §5.7) on each reached page. We re-navigate
    // the desktop page to each URL because earlier phases left it on whatever
    // came last in the funnel.
    updated(6);
    for (const p of pages) {
      if (!p.reached || !p.url) continue;
      try {
        await gotoSafe(desktop, p.url);
        p.sticky = await detectSticky(desktop);
      } catch (e) {
        console.warn(`sticky scan failed for ${p.pageType}:`, (e as Error).message);
      }
    }

    // Phase 7 — Claude analysis (text + vision). Parallelised across pages
    // (scale plan Step 6) — wall-time drops from 5×(text+vision) sequential to
    // 1×(text+vision) since each page's text→vision pair runs concurrently
    // with the others. Each pair stays sequential because vision needs the
    // screenshot path and we preserve the existing dependency order.
    updated(7);
    await Promise.all(
      pages.map(async (p) => {
        if (!p.reached) return;
        const dom = p.pageType === "homepage" ? homeDom : null;
        const findings = await analyzePage({
          pageType: p.pageType,
          url: p.url ?? url,
          domSnapshot: dom ?? { note: "no snapshot" },
          pageSpeed: p.pageSpeed,
          sticky: p.sticky,
        });
        const baymard = await baymardAudit(
          p.pageType,
          p.screenshots.desktop ? screenshotPath(reportId, p.screenshots.desktop) : undefined,
        );
        p.findings = [...findings, ...baymard];
      }),
    );

    // Phase 8 — Generate report
    updated(8);
    const { categoryScores, overall } = scoreReport(pages);
    const allFindings: Finding[] = pages.flatMap((p) => p.findings);
    const bucketSummary: BucketSummary = {
      fixNow: allFindings.filter((f) => f.bucket === "fix-now"),
      platformLimited: allFindings.filter((f) => f.bucket === "platform-limited"),
    };

    const report: Report = {
      id: reportId,
      url,
      domain,
      createdAt: new Date().toISOString(),
      status: "complete",
      overallScore: overall,
      categoryScores,
      stats: {
        totalIssues: allFindings.length,
        criticalIssues: allFindings.filter((f) => f.severity === "critical").length,
        bucket1Count: bucketSummary.fixNow.length,
        bucket2Count: bucketSummary.platformLimited.length,
      },
      pages,
      checkoutScorecard: scorecard,
      bucketSummary,
      execSummary: buildExecSummary(domain, overall, allFindings.length, bucketSummary),
    };

    writeReport(reportId, report);
    updated(STEPS.length - 1, true);
  } catch (e) {
    console.error("crawl failed:", e);
    const errReport: Report = {
      id: reportId,
      url,
      domain,
      createdAt: new Date().toISOString(),
      status: "error",
      overallScore: 0,
      categoryScores: [],
      stats: { totalIssues: 0, criticalIssues: 0, bucket1Count: 0, bucket2Count: 0 },
      pages,
      bucketSummary: { fixNow: [], platformLimited: [] },
      execSummary: "Crawl failed before completion.",
      error: (e as Error).message,
    };
    writeReport(reportId, errReport);
    updated(8, true, (e as Error).message);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

function buildExecSummary(domain: string, score: number, total: number, bs: BucketSummary): string {
  const grade = score >= 80 ? "strong" : score >= 60 ? "average" : "below benchmark";
  return `${domain} scored ${score}/100 — ${grade}. We surfaced ${total} issues across the funnel: ${bs.fixNow.length} are fixable on the current platform, while ${bs.platformLimited.length} are constrained by the underlying commerce stack and would benefit from a platform with native support for express wallets, guest checkout, and edge-cached storefronts.`;
}
