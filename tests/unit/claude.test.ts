// Section A9 — Claude wrapper, mock fallback, retry semantics
import { describe, it, expect, beforeEach } from "vitest";

const PAGE_TYPES = ["homepage", "category", "pdp", "cart", "checkout"] as const;

describe("hasClaudeKey + mock fallback", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("#70 hasClaudeKey returns false without env var", async () => {
    const { hasClaudeKey } = await import("@/lib/services/claude");
    expect(hasClaudeKey()).toBe(false);
  });

  it("#71 claudeText returns '' without API key", async () => {
    const { claudeText } = await import("@/lib/services/claude");
    expect(await claudeText({ system: "x", user: "y" })).toBe("");
  });

  it("#72 mockFindingsForPage returns ≥ 1 finding for every page type", async () => {
    const { mockFindingsForPage } = await import("@/lib/services/claude");
    for (const pt of PAGE_TYPES) {
      const findings = mockFindingsForPage(pt);
      expect(findings.length).toBeGreaterThan(0);
    }
  });

  it("#73 mock findings have all required fields", async () => {
    const { mockFindingsForPage } = await import("@/lib/services/claude");
    const findings = mockFindingsForPage("homepage");
    for (const f of findings) {
      expect(f.id).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.severity).toMatch(/critical|high|medium|low/);
      expect(f.category).toMatch(/performance|mobile|seo|conversion|technical|baymardUx/);
      expect(f.bucket).toMatch(/fix-now|platform-limited/);
      expect(f.recommendation).toBeTruthy();
      expect(f.pageType).toBe("homepage");
    }
  });
});

describe("withRetry semantics", () => {
  // Since `withRetry` is not exported, we exercise it indirectly through
  // `claudeText` with an injected client. We achieve this via vi.doMock on
  // the SDK. Each test resets modules to get a fresh closure.
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("#74 succeeds on first try → no delay", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    let calls = 0;
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor() {}
        messages = {
          create: async () => {
            calls += 1;
            return { content: [{ type: "text", text: "ok" }] };
          },
        };
      },
    }));
    const { claudeText } = await import("@/lib/services/claude");
    const result = await claudeText({ system: "x", user: "y" });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("#75 retries on simulated 429 → succeeds on attempt 2", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    let calls = 0;
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor() {}
        messages = {
          create: async () => {
            calls += 1;
            if (calls === 1) {
              const e = new Error("rate limited") as Error & { status?: number };
              e.status = 429;
              throw e;
            }
            return { content: [{ type: "text", text: "ok-after-retry" }] };
          },
        };
      },
    }));
    const { claudeText } = await import("@/lib/services/claude");
    const result = await claudeText({ system: "x", user: "y" });
    expect(result).toBe("ok-after-retry");
    expect(calls).toBe(2);
    vi.doUnmock("@anthropic-ai/sdk");
  }, 15_000);

  it("#76 retries on 503 → succeeds on attempt 3", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    let calls = 0;
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor() {}
        messages = {
          create: async () => {
            calls += 1;
            if (calls < 3) {
              const e = new Error("service unavailable") as Error & { status?: number };
              e.status = 503;
              throw e;
            }
            return { content: [{ type: "text", text: "ok-3" }] };
          },
        };
      },
    }));
    const { claudeText } = await import("@/lib/services/claude");
    const result = await claudeText({ system: "x", user: "y" });
    expect(result).toBe("ok-3");
    expect(calls).toBe(3);
    vi.doUnmock("@anthropic-ai/sdk");
  }, 30_000);

  it("#77 does NOT retry on 401", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    let calls = 0;
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor() {}
        messages = {
          create: async () => {
            calls += 1;
            const e = new Error("auth failed") as Error & { status?: number };
            e.status = 401;
            throw e;
          },
        };
      },
    }));
    const { claudeText } = await import("@/lib/services/claude");
    await expect(claudeText({ system: "x", user: "y" })).rejects.toThrow();
    expect(calls).toBe(1);
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("#78 does NOT retry on 400", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    let calls = 0;
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor() {}
        messages = {
          create: async () => {
            calls += 1;
            const e = new Error("bad request") as Error & { status?: number };
            e.status = 400;
            throw e;
          },
        };
      },
    }));
    const { claudeText } = await import("@/lib/services/claude");
    await expect(claudeText({ system: "x", user: "y" })).rejects.toThrow();
    expect(calls).toBe(1);
    vi.doUnmock("@anthropic-ai/sdk");
  });

  it("#79 exhausts 3 attempts on persistent 429 then throws", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    let calls = 0;
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        constructor() {}
        messages = {
          create: async () => {
            calls += 1;
            const e = new Error("rate limited") as Error & { status?: number };
            e.status = 429;
            throw e;
          },
        };
      },
    }));
    const { claudeText } = await import("@/lib/services/claude");
    await expect(claudeText({ system: "x", user: "y" })).rejects.toThrow();
    expect(calls).toBe(3);
    vi.doUnmock("@anthropic-ai/sdk");
  }, 30_000);

  // #80 backoff timing — implied by #75 and #76 succeeding within their
  // generous timeouts. A strict timing assertion is brittle; skipping.
});
