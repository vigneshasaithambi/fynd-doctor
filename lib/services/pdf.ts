import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { readPdf, writePdf } from "../utils/storage";

puppeteer.use(StealthPlugin());

// Cached PDF render (scale plan Step 7). Reports are immutable once done, so a
// PDF rendered for a given id never goes stale. First call: ~10s render +
// storage write. Every subsequent call: <50ms storage read.
//
// Storage backend may be local fs (dev) or Cloudflare R2 (production) — the
// `readPdf` / `writePdf` helpers abstract that away.
export async function renderReportPdf(reportId: string): Promise<Buffer> {
  const cached = await readPdf(reportId);
  if (cached) return cached;

  // BASE_URL is required so the PDF renderer can navigate back to the report
  // viewer over HTTP. Fallback chain:
  //   1. BASE_URL                (explicit)
  //   2. RENDER_EXTERNAL_URL     (auto-set by Render)
  //   3. https://${FLY_APP_NAME}.fly.dev (auto-set by Fly machines)
  //   4. localhost for local dev
  const base =
    process.env.BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : null) ||
    "http://localhost:3000";

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
      await writePdf(reportId, buf);
    } catch (e) {
      console.warn(`[pdf] failed to cache ${reportId}:`, (e as Error).message);
    }
    return buf;
  } finally {
    await browser.close().catch(() => {});
  }
}
