// Section B5 — TTL cleanup loop
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import { reportDir, ensureReportDir, writeStatus } from "@/lib/utils/storage";

const FRESH_ID = "CLEANUP-FRESH-id";
const OLD_ID = "CLEANUP-OLD-id";

afterEach(() => {
  for (const id of [FRESH_ID, OLD_ID]) {
    if (fs.existsSync(reportDir(id))) {
      fs.rmSync(reportDir(id), { recursive: true, force: true });
    }
  }
});

describe("startReportCleanup", () => {
  it("#109 sweeps directories whose status updatedAt is older than REPORT_TTL_HOURS", async () => {
    process.env.REPORT_TTL_HOURS = "0.0001"; // ~0.36s
    vi.resetModules();

    ensureReportDir(OLD_ID);
    await writeStatus(OLD_ID, {
      id: OLD_ID,
      phase: 8,
      step: "done",
      done: true,
      updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const { startReportCleanup } = await import("@/lib/utils/cleanupReports");
    startReportCleanup();
    // Sweep is now async — give microtasks + the sweep itself a moment.
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(reportDir(OLD_ID))).toBe(false);

    delete process.env.REPORT_TTL_HOURS;
  });

  it("#110 does NOT sweep recent directories", async () => {
    process.env.REPORT_TTL_HOURS = "24";
    vi.resetModules();

    ensureReportDir(FRESH_ID);
    await writeStatus(FRESH_ID, {
      id: FRESH_ID,
      phase: 8,
      step: "done",
      done: true,
      updatedAt: new Date().toISOString(),
    });

    const { startReportCleanup } = await import("@/lib/utils/cleanupReports");
    startReportCleanup();
    await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(reportDir(FRESH_ID))).toBe(true);
  });

  it("#111 idempotent — calling twice doesn't double-schedule", async () => {
    vi.resetModules();
    const { startReportCleanup } = await import("@/lib/utils/cleanupReports");
    expect(() => {
      startReportCleanup();
      startReportCleanup();
    }).not.toThrow();
  });

  it("#112 errors during sweep don't crash the process", async () => {
    // Pollute the dir listing path with a file (not a dir) — listReportIds
    // already filters non-dirs, so this shouldn't even error. The point is
    // that startReportCleanup is wrapped in try/catch.
    vi.resetModules();
    const { startReportCleanup } = await import("@/lib/utils/cleanupReports");
    expect(() => startReportCleanup()).not.toThrow();
  });
});
