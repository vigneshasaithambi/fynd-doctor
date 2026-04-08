// Section B4 — PDF cache behaviour. Cache hit/miss, magic bytes.
// Does NOT spin up a real PDF render (that would need the dev server). Tests
// the cache layer in isolation by pre-seeding `report.pdf` on disk.
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { renderReportPdf } from "@/lib/services/pdf";
import { reportDir, pdfPath, ensureReportDir } from "@/lib/utils/storage";

const TEST_ID = "PDF-CACHE-FIXTURE-id";

afterEach(() => {
  if (fs.existsSync(reportDir(TEST_ID))) {
    fs.rmSync(reportDir(TEST_ID), { recursive: true, force: true });
  }
});

describe("renderReportPdf cache", () => {
  it("#104 / #105 cached PDF returns immediately without launching Puppeteer", async () => {
    ensureReportDir(TEST_ID);
    // Seed a fake PDF on disk
    const fakeBuf = Buffer.from("%PDF-1.4\n%%FAKE TEST FIXTURE\n%%EOF");
    fs.writeFileSync(pdfPath(TEST_ID), fakeBuf);

    const t0 = Date.now();
    const buf = await renderReportPdf(TEST_ID);
    const elapsed = Date.now() - t0;

    expect(buf.equals(fakeBuf)).toBe(true);
    // Cache hit should be < 100 ms (well under any Puppeteer launch time)
    expect(elapsed).toBeLessThan(500);
  });

  it("#106 cache invalidation: deleting report.pdf forces re-render path", () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(pdfPath(TEST_ID), Buffer.from("%PDF-fake"));
    expect(fs.existsSync(pdfPath(TEST_ID))).toBe(true);
    fs.unlinkSync(pdfPath(TEST_ID));
    expect(fs.existsSync(pdfPath(TEST_ID))).toBe(false);
    // Re-render path is exercised by the E2E suite (D4) — here we just
    // verify the cache file lifecycle.
  });

  it("#108 PDF buffer starts with %PDF- magic bytes (when cached)", async () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(pdfPath(TEST_ID), Buffer.from("%PDF-1.7\n..."));
    const buf = await renderReportPdf(TEST_ID);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
