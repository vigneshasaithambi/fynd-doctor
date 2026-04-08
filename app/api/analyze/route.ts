import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { normalizeUrl } from "@/lib/utils/validators";
import { enqueueCrawl } from "@/lib/crawler/queue";
import { consumeToken, getClientIp } from "@/lib/utils/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Per-IP rate limit (scale plan Step 3)
  const ip = getClientIp(req);
  const limit = consumeToken(ip, "analyze");
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  const body = await req.json().catch(() => ({}));
  const url = normalizeUrl(body.url || "");
  if (!url) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });

  const id = uuid();
  // Enqueue — the queue writes the initial status.json itself and starts the
  // crawl when a slot frees up (scale plan Step 2).
  enqueueCrawl(id, url);
  return NextResponse.json({ id });
}
