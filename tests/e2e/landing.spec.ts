// Section D + H + part of F — landing page
import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("#136 + #157 hero, CTA, URL input, error UX", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/conversion gaps/i);
    await expect(page.getByRole("button", { name: /Analyze My Website/i })).toBeVisible();
    await expect(page.getByLabel(/Website URL/i)).toBeVisible();
  });

  test("#160 (UI part) submitting an unreachable host shows nothing on the landing page (server returns 200, route to /analyzing)", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/Website URL/i).fill("https://www.example.com");
    await page.getByRole("button", { name: /Analyze My Website/i }).click();
    // Expect navigation to analyzing/[id]
    await page.waitForURL(/\/analyzing\//);
  });

  test("#183 visual regression: landing page desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("landing-desktop.png", { fullPage: true });
  });

  test("#183b visual regression: landing page mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("landing-mobile.png", { fullPage: true });
  });
});
