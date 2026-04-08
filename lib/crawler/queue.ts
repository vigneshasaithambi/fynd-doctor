// In-process FIFO crawl queue with concurrency cap (scale plan Step 2).
//
// Why: app/api/analyze/route.ts used to fire-and-forget runCrawl() with no
// limit, so 100 simultaneous POSTs would spawn 100 concurrent crawls and OOM
// the host. This module gates crawls so only N run at once; the rest sit in a
// queue and surface their position via the same status.json the loading screen
// already polls.
//
// In-process only — no Redis. Server restart drops the queue (covered by the
// stuck-crawl detection in Step 5).

import { runCrawl } from "./index";
import { writeStatus } from "../utils/storage";

const CONCURRENCY = Math.max(1, Number(process.env.CRAWL_CONCURRENCY) || 2);

interface QueueItem {
  id: string;
  url: string;
}

const waiting: QueueItem[] = [];
let running = 0;

function rewriteQueuedPositions() {
  for (let i = 0; i < waiting.length; i++) {
    const item = waiting[i];
    // Fire-and-forget — the loader will see the new position on its next poll.
    // .catch() prevents unhandled-rejection warnings on the R2 backend.
    void writeStatus(item.id, {
      id: item.id,
      phase: -1,
      step: `Queued (position ${i + 1})`,
      done: false,
      queuePosition: i + 1,
      updatedAt: new Date().toISOString(),
    }).catch((e) =>
      console.warn(`[queue] writeStatus failed for ${item.id}:`, (e as Error).message),
    );
  }
}

function pump() {
  while (running < CONCURRENCY && waiting.length > 0) {
    const item = waiting.shift()!;
    running += 1;
    rewriteQueuedPositions();
    // Don't await — we want to keep dequeuing.
    runCrawl(item.id, item.url)
      .catch((e) => console.error(`[queue] runCrawl ${item.id} failed:`, e))
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

export function enqueueCrawl(id: string, url: string): void {
  waiting.push({ id, url });
  // Stamp an initial queued status so the loader page sees it immediately.
  // Fire-and-forget — the loader polls so a missed write self-heals.
  void writeStatus(id, {
    id,
    phase: -1,
    step: "Queued",
    done: false,
    queuePosition: waiting.length,
    updatedAt: new Date().toISOString(),
  }).catch((e) =>
    console.warn(`[queue] initial writeStatus failed for ${id}:`, (e as Error).message),
  );
  pump();
}

export function queueStats() {
  return { running, waiting: waiting.length, concurrency: CONCURRENCY };
}
