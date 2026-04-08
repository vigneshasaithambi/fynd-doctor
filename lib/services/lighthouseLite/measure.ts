// Lighthouse-lite measurement orchestrator.
//
// Spins up a Puppeteer page (reusing lib/crawler/browser.ts), applies
// Lighthouse-equivalent CDP throttling, injects the PerformanceObserver
// bootstrap, navigates, and collects raw metrics + DOM heuristic signals.
// Pure data-out — scoring lives in ./score.ts.

import type { Browser, CDPSession } from "puppeteer";
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT } from "../../crawler/browser";
import { OBSERVER_BOOTSTRAP } from "./observer";
import { SCRAPE_JS } from "./scrape";
import type { A11ySignals, BpSignals, PerfMetrics, SeoSignals } from "./score";

interface ScrapeResult {
  lh: { lcp: number; cls: number; fcp: number; ttfb: number; longTaskTotal: number };
  seo: SeoSignals;
  a11y: A11ySignals;
  bp: { hasDoctype: boolean; hasCharset: boolean; imageAspectOkRatio: number };
}

const UA_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// Lighthouse "Slow 4G" — see https://github.com/GoogleChrome/lighthouse/blob/main/core/config/constants.js
const MOBILE_THROTTLE = {
  downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.9,
  uploadThroughput: ((750 * 1024) / 8) * 0.9,
  latency: 150,
  cpuRate: 4,
};
// Lighthouse desktop preset
const DESKTOP_THROTTLE = {
  downloadThroughput: (10 * 1024 * 1024) / 8,
  uploadThroughput: (10 * 1024 * 1024) / 8,
  latency: 40,
  cpuRate: 1,
};

export interface RawMetrics {
  perf: PerfMetrics;
  ttfbMs: number;
  seo: SeoSignals;
  a11y: A11ySignals;
  bp: BpSignals;
}

// Accepts a Browser owned by the caller — does NOT launch or close its own.
// Spec scale-fix Step 1: pre-fix this spawned a fresh Chrome per call (6 per
// crawl). Now reuses the main crawl browser, so 1 Chrome serves the whole crawl.
export async function measure(
  browser: Browser,
  url: string,
  strategy: "mobile" | "desktop",
): Promise<RawMetrics> {
  const page = await browser.newPage();
  try {
    if (strategy === "mobile") {
      await page.setViewport(MOBILE_VIEWPORT);
      await page.setUserAgent(UA_MOBILE);
    } else {
      await page.setViewport(DESKTOP_VIEWPORT);
      await page.setUserAgent(UA_DESKTOP);
    }
    page.setDefaultNavigationTimeout(45000);
    page.setDefaultTimeout(20000);

    const profile = strategy === "mobile" ? MOBILE_THROTTLE : DESKTOP_THROTTLE;
    const client: CDPSession = await page.target().createCDPSession();
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: profile.downloadThroughput,
      uploadThroughput: profile.uploadThroughput,
      latency: profile.latency,
    });
    await client.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });

    let consoleErrors = 0;
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors += 1;
    });
    page.on("pageerror", () => {
      consoleErrors += 1;
    });

    // Inject the observer bootstrap as a raw string so bundlers can't rewrite
    // it (esbuild/Turbopack would otherwise add `__name` helpers that don't
    // exist in the page context).
    await page.evaluateOnNewDocument(OBSERVER_BOOTSTRAP);

    await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    // Let any late layout shifts settle.
    await new Promise((r) => setTimeout(r, 1200));

    // page.evaluate(string) executes the literal source — bundler-safe.
    const metrics = (await page.evaluate(SCRAPE_JS)) as ScrapeResult;

    const isHttps = url.startsWith("https://");

    return {
      perf: {
        fcpMs: metrics.lh.fcp,
        lcpMs: metrics.lh.lcp || metrics.lh.fcp, // some pages have no LCP entry — fall back
        clsValue: metrics.lh.cls,
        tbtMs: (metrics.lh as { longTaskTotal: number }).longTaskTotal,
      },
      ttfbMs: metrics.lh.ttfb,
      seo: metrics.seo,
      a11y: metrics.a11y,
      bp: { ...metrics.bp, isHttps, consoleErrors },
    };
  } finally {
    // Close the page but NOT the browser — caller owns the browser lifecycle.
    await page.close().catch(() => {});
  }
}
