// Section B2 — sticky/persistent UI detector
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { Browser } from "puppeteer";
import { launchBrowser } from "@/lib/crawler/browser";
import { detectSticky } from "@/lib/crawler/stickyDetector";

const FIXTURE_URL = "file://" + path.join(process.cwd(), "tests", "fixtures", "shop.html");

let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  if (browser) await browser.close().catch(() => {});
});

describe("detectSticky", () => {
  it("#93 fixture has fixed <header> → sticky.header = true", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(FIXTURE_URL, { waitUntil: "networkidle0" });
      const sticky = await detectSticky(page);
      expect(sticky.header).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#94 plain page (no sticky elements) → all flags false", async () => {
    const page = await browser.newPage();
    try {
      await page.goto("data:text/html,<h1>plain</h1>", { waitUntil: "networkidle0" });
      const sticky = await detectSticky(page);
      expect(sticky.header).toBe(false);
      expect(sticky.cartIcon).toBe(false);
      expect(sticky.primaryCta).toBe(false);
      expect(sticky.filterRail).toBe(false);
      expect(sticky.checkoutCta).toBe(false);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#95 sticky on a wrapper 3 levels above target → still detected", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(
        'data:text/html,<style>.wrap{position:fixed}</style><div class="wrap"><div><div><a href="/cart">Cart</a></div></div></div>',
        { waitUntil: "networkidle0" },
      );
      const sticky = await detectSticky(page);
      expect(sticky.cartIcon).toBe(true);
    } finally {
      await page.close();
    }
  }, 60_000);

  it("#96 returns all-false fallback object when page is closed", async () => {
    const page = await browser.newPage();
    await page.close();
    const sticky = await detectSticky(page);
    expect(sticky.header).toBe(false);
    expect(sticky.cartIcon).toBe(false);
    expect(sticky.primaryCta).toBe(false);
    expect(sticky.filterRail).toBe(false);
    expect(sticky.checkoutCta).toBe(false);
  }, 30_000);
});
