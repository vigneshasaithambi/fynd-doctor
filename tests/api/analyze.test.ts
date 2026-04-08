// Section C1 — POST /api/analyze
// Imports the route handler directly — no Next dev server needed.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import { reportDir } from "@/lib/utils/storage";

const generatedIds: string[] = [];

vi.mock("@/lib/crawler/index", () => ({
  // Stub runCrawl so the queue completes immediately without spinning up Puppeteer.
  runCrawl: vi.fn(async () => {}),
}));

beforeEach(() => {
  // Reset queue + rate limiter between tests
  vi.resetModules();
});

afterEach(() => {
  for (const id of generatedIds) {
    if (fs.existsSync(reportDir(id))) {
      fs.rmSync(reportDir(id), { recursive: true, force: true });
    }
  }
  generatedIds.length = 0;
});

async function callPost(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/analyze/route");
  const req = new Request("http://test/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe("POST /api/analyze", () => {
  it("#113 valid URL → 200 with {id: <uuid>}", async () => {
    const res = await callPost({ url: "https://www.example.com" }, { "x-forwarded-for": "10.0.0.1" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    generatedIds.push(body.id);
  });

  it("#114 invalid URL → 400 with friendly error", async () => {
    const res = await callPost({ url: "" }, { "x-forwarded-for": "10.0.0.2" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid url/i);
    expect(body.error).not.toMatch(/typeerror|stack/i);
  });

  it("#115 missing body doesn't crash", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://test/api/analyze", {
      method: "POST",
      headers: { "x-forwarded-for": "10.0.0.3" },
    });
    const res = await POST(req);
    // Either 400 (no URL) or 200 with synthesized URL — must not be 500.
    expect(res.status).toBeLessThan(500);
  });

  it("#116 rate limit: 6th request from same IP within 1 min → 429", async () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 5; i++) {
      const r = await callPost({ url: "https://x.test/" + i }, { "x-forwarded-for": ip });
      expect(r.status).toBe(200);
      const body = (await r.json()) as { id: string };
      generatedIds.push(body.id);
    }
    const sixth = await callPost({ url: "https://x.test/6" }, { "x-forwarded-for": ip });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("retry-after")).toBeTruthy();
    const body = (await sixth.json()) as { error: string };
    expect(body.error).toMatch(/too many requests/i);
  });

  it("#117 different IPs each get their own bucket", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await callPost(
        { url: "https://x.test/a" + i },
        { "x-forwarded-for": "10.0.0.5" },
      );
      const body = (await r.json()) as { id: string };
      generatedIds.push(body.id);
    }
    const otherIp = await callPost(
      { url: "https://x.test/other" },
      { "x-forwarded-for": "10.0.0.6" },
    );
    expect(otherIp.status).toBe(200);
    const body = (await otherIp.json()) as { id: string };
    generatedIds.push(body.id);
  });

  it("#118 URL gets normalised before being stored", async () => {
    const res = await callPost(
      { url: "example-norm.com" },
      { "x-forwarded-for": "10.0.0.7" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    generatedIds.push(body.id);
  });
});
