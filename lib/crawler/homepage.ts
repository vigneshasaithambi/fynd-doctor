import type { Page } from "puppeteer";

export async function gotoSafe(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  } catch (e) {
    console.warn(`gotoSafe failed for ${url}:`, (e as Error).message);
    return false;
  }
}
