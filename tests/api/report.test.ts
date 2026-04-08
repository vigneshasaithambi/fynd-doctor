// Section C3 — GET /api/report/[id]
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { reportDir, ensureReportDir, writeReport } from "@/lib/utils/storage";
import type { Report } from "@/lib/types";

const TEST_ID = "API-REPORT-FIXTURE-id";

afterEach(() => {
  if (fs.existsSync(reportDir(TEST_ID))) {
    fs.rmSync(reportDir(TEST_ID), { recursive: true, force: true });
  }
});

async function callGet(id: string) {
  const { GET } = await import("@/app/api/report/[id]/route");
  const req = new Request("http://test/api/report/" + id);
  return GET(req, { params: Promise.resolve({ id }) });
}

const fixtureReport: Report = {
  id: TEST_ID,
  url: "https://x.test",
  domain: "x.test",
  createdAt: new Date().toISOString(),
  status: "complete",
  overallScore: 88,
  categoryScores: [],
  stats: { totalIssues: 3, criticalIssues: 1, bucket1Count: 2, bucket2Count: 1 },
  pages: [],
  bucketSummary: { fixNow: [], platformLimited: [] },
  execSummary: "fixture",
};

describe("GET /api/report/[id]", () => {
  it("#124 complete report → 200 with full JSON", async () => {
    writeReport(TEST_ID, fixtureReport);
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Report;
    expect(body.overallScore).toBe(88);
  });

  it("#125 in-progress crawl → 404 (report not yet written)", async () => {
    // Status exists but report doesn't
    ensureReportDir(TEST_ID);
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(404);
  });

  it("#126 missing id → 404", async () => {
    const res = await callGet("api-report-missing-xyz");
    expect(res.status).toBe(404);
  });

  it("#127 malformed report.json → 404 (safe read returns null)", async () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(path.join(reportDir(TEST_ID), "report.json"), "{ broken");
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(404);
  });
});
