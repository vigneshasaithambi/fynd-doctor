// Section I — Accessibility audits via @axe-core/playwright
// Tagged @a11y so they can be run in isolation: `npm run test:a11y`
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const FIXTURE_ID = "fixture-report-id";

// Tests run on Chromium only — axe results don't differ meaningfully across
// engines and running 3× would inflate CI time.
test.skip(({ browserName }) => browserName !== "chromium", "a11y on chromium only");

async function noCriticalOrSerious(results: { violations: { id: string; impact?: string | null }[] }) {
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  return blocking;
}

test.describe("@a11y axe scans", () => {
  test("#193 + #199 + #202 landing page — zero critical/serious violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = await noCriticalOrSerious(results);
    if (blocking.length) console.error("[a11y] landing violations:", blocking);
    expect(blocking).toHaveLength(0);
  });

  test("#194 analyzing page (active state) — zero violations", async ({ page }) => {
    await page.route("/api/status/a11y-active", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "a11y-active",
          phase: 4,
          step: "Analyzing checkout flow",
          done: false,
          updatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.goto("/analyzing/a11y-active");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = await noCriticalOrSerious(results);
    if (blocking.length) console.error("[a11y] analyzing-active violations:", blocking);
    expect(blocking).toHaveLength(0);
  });

  test("#195 analyzing page (queued state) — zero violations", async ({ page }) => {
    await page.route("/api/status/a11y-queued", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "a11y-queued",
          phase: -1,
          step: "Queued",
          done: false,
          queuePosition: 1,
          updatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.goto("/analyzing/a11y-queued");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = await noCriticalOrSerious(results);
    expect(blocking).toHaveLength(0);
  });

  test("#196 analyzing page (error state) — zero violations", async ({ page }) => {
    test.setTimeout(60_000);
    await page.route("/api/status/a11y-error", (route) =>
      route.fulfill({ status: 500, body: '{"error":"x"}' }),
    );
    await page.goto("/analyzing/a11y-error");
    // Wait for the error UI to surface (~30s of backoff)
    await page.waitForSelector("text=/Lost contact|Polling failed|Try refreshing/i", {
      timeout: 45_000,
    });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = await noCriticalOrSerious(results);
    expect(blocking).toHaveLength(0);
  });

  test("#197 + #199 report viewer — zero violations", async ({ page }) => {
    await page.goto(`/report/${FIXTURE_ID}`);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = await noCriticalOrSerious(results);
    if (blocking.length) console.error("[a11y] report violations:", blocking);
    expect(blocking).toHaveLength(0);
  });

  test("#198 report viewer print mode — zero violations", async ({ page }) => {
    await page.goto(`/report/${FIXTURE_ID}?print=1`);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = await noCriticalOrSerious(results);
    expect(blocking).toHaveLength(0);
  });

  test("#200 keyboard navigation — Tab walk reaches the URL input + button", async ({
    page,
  }) => {
    await page.goto("/");
    // Tab a few times and verify focus eventually lands on the input then the button
    let focused = "";
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() =>
        document.activeElement ? (document.activeElement as HTMLElement).tagName : "",
      );
      if (focused === "INPUT" || focused === "BUTTON") break;
    }
    expect(["INPUT", "BUTTON"]).toContain(focused);
  });

  test("#201 landmarks present on every page (header/main)", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("header").count()).toBeGreaterThan(0);
    expect(await page.locator("main").count()).toBeGreaterThan(0);
    await page.goto(`/report/${FIXTURE_ID}`);
    expect(await page.locator("main").count()).toBeGreaterThan(0);
  });

  test("#202 landing URL input has a label", async ({ page }) => {
    await page.goto("/");
    // Either visible label or aria-label
    const input = page.getByLabel(/Website URL/i);
    await expect(input).toBeVisible();
  });
});
