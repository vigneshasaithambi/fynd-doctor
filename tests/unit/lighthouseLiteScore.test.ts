// Section A2 — lighthouse-lite scoring curves
import { describe, it, expect } from "vitest";
import {
  scorePerformance,
  scoreSeo,
  scoreA11y,
  scoreBestPractices,
  buildCwv,
  type PerfMetrics,
  type SeoSignals,
  type A11ySignals,
  type BpSignals,
} from "@/lib/services/lighthouseLite/score";

const goodMobile: PerfMetrics = { fcpMs: 1800, lcpMs: 2500, clsValue: 0.1, tbtMs: 200 };
const medianMobile: PerfMetrics = { fcpMs: 3000, lcpMs: 4000, clsValue: 0.25, tbtMs: 600 };
const awfulMobile: PerfMetrics = { fcpMs: 30000, lcpMs: 40000, clsValue: 2.5, tbtMs: 6000 };

describe("scorePerformance", () => {
  it("#9 all metrics at p10 (good) → score is in the 'good' band (≥80)", () => {
    // Lighthouse-lite's CLS curve is log-normal across the whole range so p10
    // CLS scores ~0.7 instead of 0.9 — overall lands at ~83. Still "good".
    expect(scorePerformance(goodMobile, "mobile")).toBeGreaterThanOrEqual(80);
  });

  it("#10 all metrics at median → ~50", () => {
    const s = scorePerformance(medianMobile, "mobile");
    expect(s).toBeGreaterThanOrEqual(40);
    expect(s).toBeLessThanOrEqual(60);
  });

  it("#11 all metrics 10× worse than median → ≤ 10", () => {
    expect(scorePerformance(awfulMobile, "mobile")).toBeLessThanOrEqual(10);
  });

  it("#12 desktop is harsher than mobile for the same metrics", () => {
    const m = scorePerformance(medianMobile, "mobile");
    const d = scorePerformance(medianMobile, "desktop");
    expect(d).toBeLessThanOrEqual(m);
  });

  it("#13 CLS = 0 doesn't break the curve", () => {
    const s = scorePerformance({ ...goodMobile, clsValue: 0 }, "mobile");
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThan(0);
  });

  it("#14 weight constants sum to 100 (regression guard)", () => {
    // Indirectly validated: a perfect-score scenario maxes at 100.
    const perfect: PerfMetrics = { fcpMs: 1, lcpMs: 1, clsValue: 0, tbtMs: 0 };
    expect(scorePerformance(perfect, "mobile")).toBe(100);
  });
});

describe("scoreSeo", () => {
  const base: SeoSignals = {
    hasTitle: true,
    titleLen: 30,
    hasMetaDescription: true,
    metaDescriptionLen: 100,
    hasViewport: true,
    hasCanonical: true,
    hasLang: true,
    h1Count: 1,
    imgWithAltRatio: 1,
    hasRobotsAllow: true,
    linksWithTextRatio: 1,
  };

  it("#15 missing title → significant penalty", () => {
    const full = scoreSeo(base);
    const noTitle = scoreSeo({ ...base, hasTitle: false, titleLen: 0 });
    expect(noTitle).toBeLessThan(full);
    expect(full - noTitle).toBeGreaterThanOrEqual(8);
  });

  it("#16 title length 5 → partial; length 30 → pass", () => {
    const tooShort = scoreSeo({ ...base, titleLen: 5 });
    const justRight = scoreSeo({ ...base, titleLen: 30 });
    expect(tooShort).toBeLessThan(justRight);
  });
});

describe("scoreA11y", () => {
  it("#17 100% img-alt + form labels → ≥ 90", () => {
    const s: A11ySignals = {
      imgWithAltRatio: 1,
      inputsWithLabelRatio: 1,
      buttonsWithNameRatio: 1,
      hasLang: true,
      hasMainLandmark: true,
      headingOrderOk: true,
    };
    expect(scoreA11y(s)).toBeGreaterThanOrEqual(90);
  });
});

describe("scoreBestPractices", () => {
  it("#18 HTTPS off → significant penalty", () => {
    const base: BpSignals = {
      isHttps: true,
      hasDoctype: true,
      consoleErrors: 0,
      imageAspectOkRatio: 1,
      hasCharset: true,
    };
    const httpsOn = scoreBestPractices(base);
    const httpsOff = scoreBestPractices({ ...base, isHttps: false });
    expect(httpsOff).toBeLessThan(httpsOn);
  });
});

describe("buildCwv", () => {
  it("#19 INP synthesis clamps to [80, 600]", () => {
    expect(buildCwv({ fcpMs: 1, lcpMs: 1, clsValue: 0, tbtMs: 0, ttfbMs: 0 }).inp).toBeGreaterThanOrEqual(80);
    expect(buildCwv({ fcpMs: 1, lcpMs: 1, clsValue: 0, tbtMs: 99999, ttfbMs: 0 }).inp).toBeLessThanOrEqual(600);
  });

  it("#20 ms→s for LCP/FCP rounds to 2 decimals", () => {
    const c = buildCwv({ fcpMs: 1234, lcpMs: 5678, clsValue: 0.123, tbtMs: 100, ttfbMs: 50 });
    expect(c.fcp).toBe(1.23);
    expect(c.lcp).toBe(5.68);
    expect(c.cls).toBe(0.123);
  });
});
