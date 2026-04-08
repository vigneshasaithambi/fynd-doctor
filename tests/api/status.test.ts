// Section C2 — GET /api/status/[id]
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { reportDir, ensureReportDir, writeStatus } from "@/lib/utils/storage";

const TEST_ID = "API-STATUS-FIXTURE-id";

afterEach(() => {
  if (fs.existsSync(reportDir(TEST_ID))) {
    fs.rmSync(reportDir(TEST_ID), { recursive: true, force: true });
  }
});

async function callGet(id: string) {
  const { GET } = await import("@/app/api/status/[id]/route");
  const req = new Request("http://test/api/status/" + id);
  return GET(req, { params: Promise.resolve({ id }) });
}

describe("GET /api/status/[id]", () => {
  it("#119 existing id → 200 with current status", async () => {
    writeStatus(TEST_ID, {
      id: TEST_ID,
      phase: 4,
      step: "Analyzing checkout flow",
      done: false,
      updatedAt: new Date().toISOString(),
    });
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { phase: number };
    expect(body.phase).toBe(4);
  });

  it("#120 missing id → 404", async () => {
    const res = await callGet("does-not-exist-fixture-xyz");
    expect(res.status).toBe(404);
  });

  it("#121 malformed status file on disk → 404 (safe read returns null)", async () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(path.join(reportDir(TEST_ID), "status.json"), "{ broken");
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(404); // safe read returns null → 404, not 500
  });

  it("#122 stuck status (10 min stale) → 200 with done:true and stuck error", async () => {
    writeStatus(TEST_ID, {
      id: TEST_ID,
      phase: 3,
      step: "Walking through cart",
      done: false,
      updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { done: boolean; error?: string };
    expect(body.done).toBe(true);
    expect(body.error).toMatch(/stuck/i);
  });

  it("#123 returns phase: -1 + queuePosition for queued crawls", async () => {
    writeStatus(TEST_ID, {
      id: TEST_ID,
      phase: -1,
      step: "Queued (position 3)",
      done: false,
      queuePosition: 3,
      updatedAt: new Date().toISOString(),
    });
    const res = await callGet(TEST_ID);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { phase: number; queuePosition: number };
    expect(body.phase).toBe(-1);
    expect(body.queuePosition).toBe(3);
  });
});
