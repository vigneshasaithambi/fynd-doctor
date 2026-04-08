import type { Page } from "puppeteer";
import { writeScreenshot } from "../utils/storage";

// Captures desktop + mobile PNGs and writes them through the storage backend.
// Returns the filename portion only (e.g. "homepage-desktop.png") which the
// report viewer turns into a URL via /api/screenshot/<id>/<name>.
export async function captureBoth(
  desktopPage: Page,
  mobilePage: Page,
  reportId: string,
  baseName: string,
): Promise<{ desktop: string; mobile: string }> {
  const dName = `${baseName}-desktop.png`;
  const mName = `${baseName}-mobile.png`;
  await safeShot(desktopPage, reportId, dName);
  await safeShot(mobilePage, reportId, mName);
  return { desktop: dName, mobile: mName };
}

async function safeShot(page: Page, reportId: string, name: string) {
  try {
    // Capture into memory (no `path` arg) → forwards to the storage backend.
    // This works against both local fs and R2 unchanged.
    const buffer = (await page.screenshot({ fullPage: false })) as Uint8Array;
    await writeScreenshot(reportId, name, Buffer.from(buffer));
  } catch (e) {
    console.warn("screenshot failed:", (e as Error).message);
  }
}
