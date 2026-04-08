import type { Page } from "puppeteer";
import path from "path";
import { screenshotPath } from "../utils/storage";

export async function captureBoth(
  desktopPage: Page,
  mobilePage: Page,
  reportId: string,
  baseName: string,
): Promise<{ desktop: string; mobile: string }> {
  const dPath = screenshotPath(reportId, `${baseName}-desktop.png`);
  const mPath = screenshotPath(reportId, `${baseName}-mobile.png`);
  await safeShot(desktopPage, dPath);
  await safeShot(mobilePage, mPath);
  return { desktop: path.basename(dPath), mobile: path.basename(mPath) };
}

export async function safeShot(page: Page, fullPath: string) {
  try {
    await page.screenshot({ path: fullPath as `${string}.png`, fullPage: false });
  } catch (e) {
    console.warn("screenshot failed:", (e as Error).message);
  }
}
