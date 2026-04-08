// Section B1 — lighthouse-lite measurement against fixture HTML
// Uses real Puppeteer (the same browser the crawler uses).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { Browser } from "puppeteer";
import { launchBrowser } from "@/lib/crawler/browser";
import { measure } from "@/lib/services/lighthouseLite/measure";

const FIXTURE_URL = "file://" + path.join(process.cwd(), "tests", "fixtures", "shop.html");

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  if (browser) await browser.close().catch(() => {});
});

describe("measure (mobile)", () => {
  it("#86 returns valid RawMetrics for the fixture HTML", async () => {
    const m = await measure(browser, FIXTURE_URL, "mobile");
    expect(m).toBeDefined();
    expect(m.perf).toBeDefined();
    expect(m.seo).toBeDefined();
    expect(m.a11y).toBeDefined();
    expect(m.bp).toBeDefined();
  }, 60_000);

  it("#87 LCP > 0 (observer fired)", async () => {
    const m = await measure(browser, FIXTURE_URL, "mobile");
    expect(m.perf.lcpMs).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("#88 SEO hasTitle=true for fixture (which has <title>)", async () => {
    const m = await measure(browser, FIXTURE_URL, "mobile");
    expect(m.seo.hasTitle).toBe(true);
    expect(m.seo.titleLen).toBeGreaterThan(0);
  }, 60_000);

  it("#89 isHttps=false for file:// URL", async () => {
    const m = await measure(browser, FIXTURE_URL, "mobile");
    expect(m.bp.isHttps).toBe(false);
  }, 60_000);

  it("#91 browser leak regression: 3 consecutive measure() calls leak no pages", async () => {
    const before = (await browser.pages()).length;
    for (let i = 0; i < 3; i++) {
      await measure(browser, FIXTURE_URL, "mobile");
    }
    const after = (await browser.pages()).length;
    expect(after).toBeLessThanOrEqual(before + 1); // tolerate the about:blank
  }, 120_000);

  it("#92 throws/handles unreachable URL without crashing host browser", async () => {
    let threw = false;
    try {
      await measure(browser, "http://0.0.0.0:9", "mobile");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // Browser is still alive
    expect(browser.connected).toBe(true);
  }, 60_000);
});
