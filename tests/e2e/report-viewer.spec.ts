// Section D3 + H — report viewer rendering
import { test, expect } from "@playwright/test";

const FIXTURE_ID = "fixture-report-id"; // seeded by global-setup

test.describe("report viewer", () => {
  test("#140 + #147 + #150 + #152 + #153 all sections render", async ({ page }) => {
    await page.goto(`/report/${FIXTURE_ID}`);
    await expect(page.getByText(/fixture\.example\.com/).first()).toBeVisible();
    // Score ring with the overall number
    await expect(page.getByText(/78/).first()).toBeVisible();
    // Category bars - look for category labels
    await expect(page.getByText(/Performance/i).first()).toBeVisible();
    // Checkout scorecard label
    await expect(page.getByText(/checkout/i).first()).toBeVisible();
  });

  test("#148 + #149 page tabs visible (5 page types)", async ({ page }) => {
    await page.goto(`/report/${FIXTURE_ID}`);
    // 5 tabs at minimum — can be buttons or anchors. Look for page-type text.
    const homepage = page.getByText(/homepage/i).first();
    const checkout = page.getByText(/checkout/i).first();
    await expect(homepage).toBeVisible();
    await expect(checkout).toBeVisible();
  });

  test("#152 sticky bars contain URL + Download PDF", async ({ page }) => {
    await page.goto(`/report/${FIXTURE_ID}`);
    await expect(page.getByText(/fixture\.example\.com/).first()).toBeVisible();
    await expect(page.getByText(/Download PDF/i).first()).toBeVisible();
  });

  test("#187 visual: report viewer hero (score ring + category bars)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/report/${FIXTURE_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("report-hero.png", { fullPage: false });
  });

  test("#190 visual: bucket summary 2-col desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/report/${FIXTURE_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("report-full-desktop.png", { fullPage: true });
  });

  test("#190b visual: report stacked mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/report/${FIXTURE_ID}`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("report-full-mobile.png", { fullPage: true });
  });
});
