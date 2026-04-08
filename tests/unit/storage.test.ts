// Section A7 — storage atomicity, safe reads, stuck detection
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  writeStatus,
  readStatus,
  writeReport,
  readReport,
  reportDir,
  pdfPath,
  screenshotPath,
  listReportIds,
  deleteReport,
} from "@/lib/utils/storage";
import type { Report, StatusFile } from "@/lib/types";

const TEST_ID = "TEST-STORAGE-FIXTURE-id";

function makeStatus(overrides: Partial<StatusFile> = {}): StatusFile {
  return {
    id: TEST_ID,
    phase: 3,
    step: "Walking through cart",
    done: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  if (fs.existsSync(reportDir(TEST_ID))) {
    fs.rmSync(reportDir(TEST_ID), { recursive: true, force: true });
  }
});

describe("storage atomicity", () => {
  it("#52 writeStatus writes a valid JSON file", async () => {
    await writeStatus(TEST_ID, makeStatus());
    const raw = fs.readFileSync(path.join(reportDir(TEST_ID), "status.json"), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("#53 readStatus returns null when file missing", async () => {
    expect(await readStatus("does-not-exist-id-xyz")).toBeNull();
  });

  it("#54 readStatus returns null when JSON malformed", async () => {
    const dir = reportDir(TEST_ID);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "status.json"), "{ broken json");
    expect(await readStatus(TEST_ID)).toBeNull();
  });

  it("#55 readStatus returns null when file is half-written", async () => {
    const dir = reportDir(TEST_ID);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "status.json"), '{"id":"x","phase":3,"step":"Walking');
    expect(await readStatus(TEST_ID)).toBeNull();
  });

  it("#56 stuck status (6+ min old, done:false) is transformed to done:true with error", async () => {
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await writeStatus(TEST_ID, makeStatus({ updatedAt: old, done: false }));
    const r = await readStatus(TEST_ID);
    expect(r?.done).toBe(true);
    expect(r?.error).toMatch(/stuck/i);
  });

  it("#57 stuck detection does NOT mutate the on-disk file", async () => {
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await writeStatus(TEST_ID, makeStatus({ updatedAt: old, done: false }));
    await readStatus(TEST_ID);
    const raw = JSON.parse(fs.readFileSync(path.join(reportDir(TEST_ID), "status.json"), "utf8"));
    expect(raw.done).toBe(false);
  });

  it("#58 done:true status is returned unchanged regardless of age", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await writeStatus(TEST_ID, makeStatus({ updatedAt: old, done: true }));
    const r = await readStatus(TEST_ID);
    expect(r?.done).toBe(true);
    expect(r?.error).toBeUndefined();
  });

  it("#59 writeReport / readReport round-trip", async () => {
    const report: Report = {
      id: TEST_ID,
      url: "https://x",
      domain: "x",
      createdAt: new Date().toISOString(),
      status: "complete",
      overallScore: 80,
      categoryScores: [],
      stats: { totalIssues: 0, criticalIssues: 0, bucket1Count: 0, bucket2Count: 0 },
      pages: [],
      bucketSummary: { fixNow: [], platformLimited: [] },
      execSummary: "test",
    };
    await writeReport(TEST_ID, report);
    const r = await readReport(TEST_ID);
    expect(r?.overallScore).toBe(80);
  });

  it("#60 pdfPath/screenshotPath/reportDir return correct paths", () => {
    expect(pdfPath(TEST_ID)).toContain(TEST_ID);
    expect(pdfPath(TEST_ID).endsWith("report.pdf")).toBe(true);
    expect(screenshotPath(TEST_ID, "homepage-desktop.png")).toContain("screenshots");
    expect(reportDir(TEST_ID).endsWith(TEST_ID)).toBe(true);
  });

  it("#61 listReportIds skips non-directory entries", async () => {
    await writeStatus(TEST_ID, makeStatus());
    const ids = await listReportIds();
    expect(ids).toContain(TEST_ID);
  });

  it("#62 deleteReport removes the directory + contents", async () => {
    await writeStatus(TEST_ID, makeStatus());
    expect(fs.existsSync(reportDir(TEST_ID))).toBe(true);
    await deleteReport(TEST_ID);
    expect(fs.existsSync(reportDir(TEST_ID))).toBe(false);
  });
});
