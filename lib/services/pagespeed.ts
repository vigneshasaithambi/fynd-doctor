// In-house Lighthouse-lite — replaces Google PSI to remove the external dep.
// All measurement runs locally via Puppeteer (lib/services/lighthouseLite).
// On any failure (timeout, navigation, browser crash) we fall back to a
// deterministic mock so the report still renders.

import type { Browser } from "puppeteer";
import type { PageSpeedResult } from "../types";
import { measure } from "./lighthouseLite/measure";
import {
  buildCwv,
  scoreA11y,
  scoreBestPractices,
  scorePerformance,
  scoreSeo,
} from "./lighthouseLite/score";

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rand(seed: number, min: number, max: number) {
  const x = Math.sin(seed) * 10000;
  const f = x - Math.floor(x);
  return Math.round((min + f * (max - min)) * 100) / 100;
}

function mockResult(url: string, strategy: "mobile" | "desktop"): PageSpeedResult {
  const seed = hashSeed(url + strategy);
  const isMobile = strategy === "mobile";
  return {
    url,
    strategy,
    performance: Math.round(rand(seed + 1, isMobile ? 38 : 62, isMobile ? 72 : 92)),
    accessibility: Math.round(rand(seed + 2, 78, 96)),
    bestPractices: Math.round(rand(seed + 3, 75, 95)),
    seo: Math.round(rand(seed + 4, 80, 100)),
    cwv: {
      lcp: rand(seed + 5, isMobile ? 2.4 : 1.6, isMobile ? 4.8 : 3.2),
      cls: rand(seed + 6, 0.02, 0.22),
      inp: Math.round(rand(seed + 7, isMobile ? 180 : 80, isMobile ? 480 : 220)),
      fcp: rand(seed + 8, isMobile ? 1.6 : 0.9, isMobile ? 3.2 : 1.8),
      ttfb: Math.round(rand(seed + 9, 220, 920)),
    },
    mocked: true,
  };
}

export async function runPageSpeed(
  browser: Browser,
  url: string,
  strategy: "mobile" | "desktop",
): Promise<PageSpeedResult> {
  try {
    const raw = await measure(browser, url, strategy);
    return {
      url,
      strategy,
      performance: scorePerformance(raw.perf, strategy),
      accessibility: scoreA11y(raw.a11y),
      bestPractices: scoreBestPractices(raw.bp),
      seo: scoreSeo(raw.seo),
      cwv: buildCwv({ ...raw.perf, ttfbMs: raw.ttfbMs }),
    };
  } catch (e) {
    console.error(
      `[pagespeed] local measurement failed for ${url} (${strategy}):`,
      (e as Error).message,
    );
    return mockResult(url, strategy);
  }
}
