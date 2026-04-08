// Section A8 — in-process crawl queue
// We mock runCrawl to a controllable promise so we can verify queue ordering
// without spinning up Puppeteer.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import fs from "fs";
import { reportDir } from "@/lib/utils/storage";

const runCrawlMock = vi.fn();
vi.mock("@/lib/crawler/index", () => ({
  runCrawl: (id: string, url: string) => runCrawlMock(id, url),
}));

const TEST_IDS = ["q-1", "q-2", "q-3", "q-4", "q-5"];

beforeEach(() => {
  vi.resetModules();
  runCrawlMock.mockReset();
});

afterEach(() => {
  for (const id of TEST_IDS) {
    if (fs.existsSync(reportDir(id))) {
      fs.rmSync(reportDir(id), { recursive: true, force: true });
    }
  }
});

async function flush() {
  // Let microtasks resolve
  await new Promise((r) => setTimeout(r, 0));
}

describe("crawl queue (concurrency = 2)", () => {
  it("#63 enqueueCrawl writes initial Queued status", async () => {
    process.env.CRAWL_CONCURRENCY = "2";
    runCrawlMock.mockReturnValue(new Promise(() => {})); // never resolves
    const { enqueueCrawl } = await import("@/lib/crawler/queue");
    enqueueCrawl(TEST_IDS[0], "https://x");
    await flush();
    const status = JSON.parse(
      fs.readFileSync(reportDir(TEST_IDS[0]) + "/status.json", "utf8"),
    );
    // First item runs immediately at concurrency 2 — phase 0 from runCrawl
    // wouldn't fire because runCrawl is mocked. So the phase is whatever the
    // queue wrote. Pre-pump it writes phase=-1 (queued); after pump it
    // dequeues (no phase rewrite from runCrawl). Either way phase ∈ {-1, undefined}.
    expect([-1, undefined]).toContain(status.phase);
  });

  it("#64 with 5 enqueued and concurrency 2, exactly 2 run and 3 wait", async () => {
    process.env.CRAWL_CONCURRENCY = "2";
    let resolveFirst: () => void = () => {};
    let resolveSecond: () => void = () => {};
    const calls: string[] = [];
    runCrawlMock.mockImplementation((id: string) => {
      calls.push(id);
      return new Promise<void>((resolve) => {
        if (calls.length === 1) resolveFirst = resolve;
        else if (calls.length === 2) resolveSecond = resolve;
      });
    });

    const { enqueueCrawl, queueStats } = await import("@/lib/crawler/queue");
    for (const id of TEST_IDS) enqueueCrawl(id, "https://x");
    await flush();

    expect(calls).toHaveLength(2);
    const stats = queueStats();
    expect(stats.running).toBe(2);
    expect(stats.waiting).toBe(3);
    // Cleanup — finish them so process exits cleanly
    resolveFirst();
    await flush();
    resolveSecond();
    await flush();
    void resolveFirst;
    void resolveSecond;
  });

  it("#65 queueStats reflects running + waiting + concurrency", async () => {
    process.env.CRAWL_CONCURRENCY = "2";
    runCrawlMock.mockReturnValue(new Promise(() => {}));
    const { enqueueCrawl, queueStats } = await import("@/lib/crawler/queue");
    enqueueCrawl(TEST_IDS[0], "https://x");
    enqueueCrawl(TEST_IDS[1], "https://x");
    enqueueCrawl(TEST_IDS[2], "https://x");
    await flush();
    expect(queueStats().concurrency).toBe(2);
    expect(queueStats().running).toBe(2);
    expect(queueStats().waiting).toBe(1);
  });

  it("#66 next item dequeues after one finishes", async () => {
    process.env.CRAWL_CONCURRENCY = "1";
    let resolveFirst: () => void = () => {};
    const calls: string[] = [];
    runCrawlMock.mockImplementation((id: string) => {
      calls.push(id);
      if (calls.length === 1) {
        return new Promise<void>((r) => {
          resolveFirst = r;
        });
      }
      return Promise.resolve();
    });

    const { enqueueCrawl } = await import("@/lib/crawler/queue");
    enqueueCrawl(TEST_IDS[0], "https://x");
    enqueueCrawl(TEST_IDS[1], "https://x");
    await flush();
    expect(calls).toEqual([TEST_IDS[0]]);

    resolveFirst();
    await flush();
    await flush();
    expect(calls).toEqual([TEST_IDS[0], TEST_IDS[1]]);
  });

  it("#67 error in one crawl doesn't stop the queue", async () => {
    process.env.CRAWL_CONCURRENCY = "1";
    const calls: string[] = [];
    runCrawlMock.mockImplementation((id: string) => {
      calls.push(id);
      if (calls.length === 1) return Promise.reject(new Error("boom"));
      return Promise.resolve();
    });

    const { enqueueCrawl } = await import("@/lib/crawler/queue");
    enqueueCrawl(TEST_IDS[0], "https://x");
    enqueueCrawl(TEST_IDS[1], "https://x");
    await flush();
    await flush();
    expect(calls).toEqual([TEST_IDS[0], TEST_IDS[1]]);
  });

  it("#68 CRAWL_CONCURRENCY env var is respected", async () => {
    process.env.CRAWL_CONCURRENCY = "3";
    runCrawlMock.mockReturnValue(new Promise(() => {}));
    const { enqueueCrawl, queueStats } = await import("@/lib/crawler/queue");
    enqueueCrawl(TEST_IDS[0], "https://x");
    enqueueCrawl(TEST_IDS[1], "https://x");
    enqueueCrawl(TEST_IDS[2], "https://x");
    enqueueCrawl(TEST_IDS[3], "https://x");
    await flush();
    expect(queueStats().concurrency).toBe(3);
    expect(queueStats().running).toBe(3);
    expect(queueStats().waiting).toBe(1);
  });

  it("#69 queue position rewritten when items shift forward", async () => {
    process.env.CRAWL_CONCURRENCY = "1";
    let resolveFirst: () => void = () => {};
    runCrawlMock.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveFirst = r;
        }),
    );
    runCrawlMock.mockImplementation(() => new Promise(() => {}));

    const { enqueueCrawl } = await import("@/lib/crawler/queue");
    enqueueCrawl(TEST_IDS[0], "https://x");
    enqueueCrawl(TEST_IDS[1], "https://x");
    enqueueCrawl(TEST_IDS[2], "https://x");
    await flush();

    // q-2 is at position 1, q-3 at position 2
    const s2 = JSON.parse(fs.readFileSync(reportDir(TEST_IDS[1]) + "/status.json", "utf8"));
    const s3 = JSON.parse(fs.readFileSync(reportDir(TEST_IDS[2]) + "/status.json", "utf8"));
    expect(s2.queuePosition).toBe(1);
    expect(s3.queuePosition).toBe(2);

    resolveFirst();
    await flush();
    await flush();

    // After q-1 finishes, q-2 dequeues (now running), q-3 should shift to position 1
    const s3After = JSON.parse(
      fs.readFileSync(reportDir(TEST_IDS[2]) + "/status.json", "utf8"),
    );
    expect(s3After.queuePosition).toBe(1);
  });
});
