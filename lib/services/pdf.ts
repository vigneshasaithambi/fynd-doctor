import fs from "fs";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { pdfPath, ensureReportDir } from "../utils/storage";

puppeteer.use(StealthPlugin());

// Cached PDF render (scale plan Step 7). Reports are immutable once done, so a
// PDF rendered for a given id never goes stale. First call: ~10s render +
// disk write. Every subsequent call: <50ms disk read.
export async function renderReportPdf(reportId: string): Promise<Buffer> {
  const cachedPath = pdfPath(reportId);
  if (fs.existsSync(cachedPath)) {
    try {
      return fs.readFileSync(cachedPath);
    } catch (e) {
      console.warn(
        `[pdf] cached read failed for ${reportId}, re-rendering:`,
        (e as Error).message,
      );
    }
  }

  // BASE_URL is required so the PDF renderer can navigate back to the report
  // viewer over HTTP. On Render, RENDER_EXTERNAL_URL is set automatically to
  // the public service URL — fall through to it. Final fallback is localhost
  // for local dev.
  const base =
    process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800 });
    await page.goto(`${base}/report/${reportId}?print=1`, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    const buf = Buffer.from(buffer);
    try {
      ensureReportDir(reportId);
      fs.writeFileSync(cachedPath, buf);
    } catch (e) {
      console.warn(
        `[pdf] failed to cache ${reportId}:`,
        (e as Error).message,
      );
    }
    return buf;
  } finally {
    await browser.close().catch(() => {});
  }
}
