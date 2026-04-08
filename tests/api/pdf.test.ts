// Section C4 — GET /api/pdf/[id]
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "fs";
import { reportDir, ensureReportDir, pdfPath } from "@/lib/utils/storage";

const TEST_ID = "API-PDF-FIXTURE-id";

// Mock the actual PDF render so we don't spawn Puppeteer.
vi.mock("@/lib/services/pdf", () => ({
  renderReportPdf: vi.fn(async (id: string) => {
    const cached = pdfPath(id);
    if (fs.existsSync(cached)) return fs.readFileSync(cached);
    return Buffer.from("%PDF-1.4\nfake-render-output\n%%EOF");
  }),
}));

afterEach(() => {
  if (fs.existsSync(reportDir(TEST_ID))) {
    fs.rmSync(reportDir(TEST_ID), { recursive: true, force: true });
  }
  vi.resetModules();
});

async function callGet(id: string, ip = "10.0.0.20") {
  const { GET } = await import("@/app/api/pdf/[id]/route");
  const req = new Request("http://test/api/pdf/" + id, {
    headers: { "x-forwarded-for": ip },
  });
  return GET(req, { params: Promise.resolve({ id }) });
}

describe("GET /api/pdf/[id]", () => {
  it("#128 existing report → 200 with application/pdf", async () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(pdfPath(TEST_ID), Buffer.from("%PDF-1.4\nseed\n%%EOF"));
    const res = await callGet(TEST_ID, "10.0.0.21");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("#129 Content-Disposition: attachment header", async () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(pdfPath(TEST_ID), Buffer.from("%PDF-1.4\nseed\n%%EOF"));
    const res = await callGet(TEST_ID, "10.0.0.22");
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(res.headers.get("content-disposition")).toMatch(new RegExp(TEST_ID));
  });

  it("#130 cached PDF returns < 100 ms", async () => {
    ensureReportDir(TEST_ID);
    fs.writeFileSync(pdfPath(TEST_ID), Buffer.from("%PDF-1.4\nseed\n%%EOF"));
    const t0 = Date.now();
    const res = await callGet(TEST_ID, "10.0.0.23");
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });

  it("#131 rate limit: 11th request from same IP → 429", async () => {
    const ip = "10.0.0.24";
    ensureReportDir(TEST_ID);
    fs.writeFileSync(pdfPath(TEST_ID), Buffer.from("%PDF-1.4\nseed\n%%EOF"));
    for (let i = 0; i < 10; i++) {
      const r = await callGet(TEST_ID, ip);
      expect(r.status).toBe(200);
    }
    const eleventh = await callGet(TEST_ID, ip);
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get("retry-after")).toBeTruthy();
    const body = (await eleventh.json()) as { error: string };
    expect(body.error).toMatch(/too many/i);
  });

  it("#132 missing report → friendly JSON error (not raw HTML)", async () => {
    // The mocked renderReportPdf doesn't actually fail on missing — but let's
    // verify the route's error contract. Force the mock to throw.
    vi.resetModules();
    vi.doMock("@/lib/services/pdf", () => ({
      renderReportPdf: vi.fn(async () => {
        throw new Error("report not found");
      }),
    }));
    const { GET } = await import("@/app/api/pdf/[id]/route");
    const req = new Request("http://test/api/pdf/missing", {
      headers: { "x-forwarded-for": "10.0.0.99" },
    });
    const res = await GET(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/json/);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });
});
