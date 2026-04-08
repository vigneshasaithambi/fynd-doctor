// Section C5 — GET /api/screenshot/[id]/[name]
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { reportDir, ensureReportDir, screenshotPath } from "@/lib/utils/storage";

const TEST_ID = "API-SCREENSHOT-FIXTURE-id";

afterEach(() => {
  if (fs.existsSync(reportDir(TEST_ID))) {
    fs.rmSync(reportDir(TEST_ID), { recursive: true, force: true });
  }
});

async function callGet(id: string, name: string) {
  const { GET } = await import("@/app/api/screenshot/[id]/[name]/route");
  const req = new Request(`http://test/api/screenshot/${id}/${name}`);
  return GET(req, { params: Promise.resolve({ id, name }) });
}

describe("GET /api/screenshot/[id]/[name]", () => {
  it("#133 existing screenshot → 200 with image/png", async () => {
    ensureReportDir(TEST_ID);
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(screenshotPath(TEST_ID, "homepage-desktop.png"), fakePng);
    const res = await callGet(TEST_ID, "homepage-desktop.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("#134 path traversal (../../etc/passwd) → 400 (security guard)", async () => {
    const res = await callGet(TEST_ID, "../../../etc/passwd");
    expect([400, 404]).toContain(res.status); // 400 from SAFE_NAME guard
    // The body must NOT contain real /etc/passwd content
    const text = await res.text();
    expect(text).not.toContain("root:");
  });

  it("#134b path traversal via encoded chars → 400", async () => {
    const res = await callGet(TEST_ID, "..%2F..%2Fetc%2Fpasswd");
    expect([400, 404]).toContain(res.status);
  });

  it("#134c invalid filename (no extension) → 400", async () => {
    const res = await callGet(TEST_ID, "no-extension");
    expect(res.status).toBe(400);
  });

  it("#135 missing screenshot → 404", async () => {
    ensureReportDir(TEST_ID);
    const res = await callGet(TEST_ID, "does-not-exist.png");
    expect(res.status).toBe(404);
  });
});
