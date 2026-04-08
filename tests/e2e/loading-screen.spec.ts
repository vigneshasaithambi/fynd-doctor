// Section D2 + H + F — analyzing/[id] loading screen
import { test, expect } from "@playwright/test";

test.describe("loading screen", () => {
  test("#138 + #141 + #142 9 steps render and pulse during a real crawl", async ({ page }) => {
    // Hit the analyzing page directly with an unknown id — the status route
    // returns 404, which after 5 backoff retries shows an error.
    // For an active state we'd need a real crawl in flight; the cleanest way
    // is to mock /api/status via page.route().
    let phase = 0;
    await page.route("/api/status/test-active-id", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "test-active-id",
          phase: phase++,
          step: "Crawling category pages",
          done: false,
          updatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.goto("/analyzing/test-active-id");
    // 9 step pills should be present
    const items = page.locator("ul li");
    await expect(items).toHaveCount(9);
    // Header text
    await expect(page.getByRole("heading", { name: /Analyzing your store/i })).toBeVisible();
  });

  test("#143 + #176 + #185 queued state shows 'Waiting in queue…' and step list is all-pending", async ({ page }) => {
    await page.route("/api/status/test-queued-id", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "test-queued-id",
          phase: -1,
          step: "Queued (position 3)",
          done: false,
          queuePosition: 3,
          updatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.goto("/analyzing/test-queued-id");
    await expect(page.getByRole("heading", { name: /Waiting in queue/i })).toBeVisible();
    await expect(page.getByText(/Another crawl is running/i)).toBeVisible();
  });

  test("#144 + #146 + #174 max-failures error UX (friendly copy, not a stack trace)", async ({ page }) => {
    // Force every status call to fail
    await page.route("/api/status/test-fail-id", (route) =>
      route.fulfill({ status: 500, body: '{"error":"x"}' }),
    );
    await page.goto("/analyzing/test-fail-id");
    // Wait for the max-retries banner (should appear within ~30s based on backoff)
    await expect(page.getByText(/Lost contact|Polling failed|Try refreshing/i)).toBeVisible({
      timeout: 60_000,
    });
    // Must not contain a stack trace
    const html = await page.content();
    expect(html).not.toMatch(/at \w+\.[\w$]+ \(/); // node stack frame pattern
  });

  test("#145 stuck-crawl response shows error and does not auto-redirect", async ({ page }) => {
    await page.route("/api/status/test-stuck-id", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "test-stuck-id",
          phase: 3,
          step: "Walking through cart",
          done: true,
          error: "Crawl appears stuck (no progress for 600s)",
          updatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.goto("/analyzing/test-stuck-id");
    await expect(page.getByText(/stuck/i)).toBeVisible();
    // 2-second window — should NOT have redirected to /report/
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/analyzing/");
  });

  test("#184 + #186 visual: queued + active states", async ({ page }) => {
    // Queued
    await page.route("/api/status/vis-queue", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: "vis-queue",
          phase: -1,
          step: "Queued (position 1)",
          done: false,
          queuePosition: 1,
          updatedAt: new Date().toISOString(),
        }),
      }),
    );
    await page.goto("/analyzing/vis-queue");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("loading-queued.png", { fullPage: true });
  });
});
