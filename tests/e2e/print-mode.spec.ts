// Section D4 — print mode
import { test, expect } from "@playwright/test";

const FIXTURE_ID = "fixture-report-id";

test.describe("print mode", () => {
  test("#154 ?print=1 hides sticky bars", async ({ page }) => {
    await page.goto(`/report/${FIXTURE_ID}?print=1`);
    await page.waitForLoadState("networkidle");
    // Sticky bars use Tailwind print:hidden — apply emulation
    await page.emulateMedia({ media: "print" });
    // Use a selector tied to the sticky top bar's "Download PDF" button — it
    // should not be visible in print media.
    const dlButton = page.getByText(/Download PDF/i);
    if (await dlButton.count()) {
      // Either hidden or display:none
      const visible = await dlButton.isVisible();
      expect(visible).toBe(false);
    }
  });

  test("#191 visual: print mode", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/report/${FIXTURE_ID}?print=1`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("report-print.png", { fullPage: true });
  });
});
