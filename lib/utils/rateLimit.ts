// In-process per-IP token bucket (scale plan Step 3).
//
// Two named buckets: "analyze" (5 / min) and "pdf" (10 / min). Cheap reads
// (status, report, screenshot) are intentionally unthrottled because the
// loading screen polls them every 1.5 s.
//
// State lives in a module-level Map<key, BucketState>. Server restart resets
// everything — fine for an MVP. If you want per-IP state across restarts,
// move this to Redis (out of scope for the current plan).

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

interface BucketDef {
  capacity: number;
  refillPerSec: number;
}

const BUCKETS: Record<string, BucketDef> = {
  analyze: { capacity: 5, refillPerSec: 5 / 60 }, // 5 per minute
  pdf: { capacity: 10, refillPerSec: 10 / 60 }, // 10 per minute
};

const state = new Map<string, BucketState>();

// Janitor: drop entries that haven't been touched in 10 minutes so the Map
// doesn't grow forever under traffic from many distinct IPs.
const JANITOR_INTERVAL_MS = 5 * 60 * 1000;
let janitorStarted = false;
function startJanitor() {
  if (janitorStarted) return;
  janitorStarted = true;
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, s] of state) {
      if (s.lastRefillMs < cutoff) state.delete(key);
    }
  }, JANITOR_INTERVAL_MS).unref?.();
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Try to consume one token from `bucket` for `ip`. Returns ok=true if allowed,
 * otherwise ok=false with retryAfterSec set to roughly when the next token will
 * be available.
 */
export function consumeToken(ip: string, bucket: keyof typeof BUCKETS): RateLimitResult {
  startJanitor();
  const def = BUCKETS[bucket];
  if (!def) return { ok: true, retryAfterSec: 0 };

  const key = `${bucket}:${ip}`;
  const now = Date.now();
  let s = state.get(key);
  if (!s) {
    s = { tokens: def.capacity, lastRefillMs: now };
    state.set(key, s);
  }

  // Refill since last touch
  const elapsedSec = (now - s.lastRefillMs) / 1000;
  s.tokens = Math.min(def.capacity, s.tokens + elapsedSec * def.refillPerSec);
  s.lastRefillMs = now;

  if (s.tokens >= 1) {
    s.tokens -= 1;
    return { ok: true, retryAfterSec: 0 };
  }

  // Not enough — compute when the next full token will arrive.
  const deficit = 1 - s.tokens;
  const retryAfterSec = Math.ceil(deficit / def.refillPerSec);
  return { ok: false, retryAfterSec };
}

/** Best-effort IP extraction from a Next Request. Falls back to "unknown". */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
