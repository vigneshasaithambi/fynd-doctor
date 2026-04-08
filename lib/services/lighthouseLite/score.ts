// Lighthouse-lite scoring.
//
// Performance scoring uses Lighthouse v11 weights and the same log-normal
// curve shape Lighthouse uses to map raw metric values to a 0..1 score:
//
//   https://github.com/GoogleChrome/lighthouse/blob/main/core/audits/metrics
//
// Each metric has a "p10" point (≈top 10% of sites — score=0.9) and a
// "median" point (score=0.5). Scores are clamped to [0,1] then weighted.
//
// A11y / BP / SEO are simple weighted checklists — pass = 1, partial = 0.5,
// fail = 0. Final score = weighted sum × 100.

import type { CoreWebVitals } from "../../types";

// ---------------------------------------------------------------------------
// Performance — log-normal curve
// ---------------------------------------------------------------------------

// Standard normal CDF approximation (Abramowitz & Stegun 7.1.26)
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

/**
 * Lighthouse-style log-normal score curve.
 * @param value  observed metric value
 * @param p10    "good" reference (top 10% of sites)  → score = 0.9
 * @param median 50th-percentile reference            → score = 0.5
 */
function logNormalScore(value: number, p10: number, median: number): number {
  if (value <= 0) return 1;
  // Solve for the location/shape that maps p10→0.9 and median→0.5
  const INVERSE_ERFC_ONE_FIFTH = 0.9061938024368232; // erfc⁻¹(0.2)
  const xRatio = Math.log(median) - Math.log(p10);
  const standardizedX =
    (Math.log(value) - Math.log(median)) /
    (Math.SQRT2 * (xRatio / (Math.SQRT2 * INVERSE_ERFC_ONE_FIFTH)));
  return Math.max(0, Math.min(1, 1 - normCdf(standardizedX)));
}

// Lighthouse v11 mobile thresholds (units: ms / unitless for CLS).
// Values lifted from Lighthouse audit source (see link above).
const THRESHOLDS = {
  mobile: {
    fcp: { p10: 1800, median: 3000 },
    lcp: { p10: 2500, median: 4000 },
    tbt: { p10: 200, median: 600 },
    cls: { p10: 0.1, median: 0.25 },
    si: { p10: 3400, median: 5800 },
  },
  desktop: {
    fcp: { p10: 900, median: 1600 },
    lcp: { p10: 1200, median: 2400 },
    tbt: { p10: 150, median: 350 },
    cls: { p10: 0.1, median: 0.25 },
    si: { p10: 1300, median: 2300 },
  },
};

// Lighthouse v11 performance category weights
const PERF_WEIGHTS = { fcp: 10, lcp: 25, tbt: 30, cls: 25, si: 10 };

export interface PerfMetrics {
  fcpMs: number;
  lcpMs: number;
  clsValue: number;
  tbtMs: number;
  // Speed Index proxy — we approximate it from FCP+LCP since real SI requires
  // a filmstrip. SI ≈ FCP + 0.6 * (LCP − FCP) gives a value that lands in the
  // same ballpark for typical sites.
}

export function scorePerformance(
  m: PerfMetrics,
  strategy: "mobile" | "desktop",
): number {
  const t = THRESHOLDS[strategy];
  const siProxyMs = m.fcpMs + 0.6 * Math.max(0, m.lcpMs - m.fcpMs);

  const sFcp = logNormalScore(m.fcpMs, t.fcp.p10, t.fcp.median);
  const sLcp = logNormalScore(m.lcpMs, t.lcp.p10, t.lcp.median);
  const sTbt = logNormalScore(m.tbtMs, t.tbt.p10, t.tbt.median);
  // CLS is unitless and not log-normal in real Lighthouse but the curve still
  // produces sensible results in [0,1].
  const sCls = logNormalScore(Math.max(m.clsValue, 0.001), t.cls.p10, t.cls.median);
  const sSi = logNormalScore(siProxyMs, t.si.p10, t.si.median);

  const total =
    sFcp * PERF_WEIGHTS.fcp +
    sLcp * PERF_WEIGHTS.lcp +
    sTbt * PERF_WEIGHTS.tbt +
    sCls * PERF_WEIGHTS.cls +
    sSi * PERF_WEIGHTS.si;
  const denom =
    PERF_WEIGHTS.fcp +
    PERF_WEIGHTS.lcp +
    PERF_WEIGHTS.tbt +
    PERF_WEIGHTS.cls +
    PERF_WEIGHTS.si;
  return Math.round((total / denom) * 100);
}

// ---------------------------------------------------------------------------
// Checklist scoring (A11y / BP / SEO)
// ---------------------------------------------------------------------------

export type CheckResult = "pass" | "partial" | "fail";
export interface Check {
  id: string;
  weight: number;
  result: CheckResult;
}

function checklistScore(checks: Check[]): number {
  let earned = 0;
  let total = 0;
  for (const c of checks) {
    total += c.weight;
    earned += c.weight * (c.result === "pass" ? 1 : c.result === "partial" ? 0.5 : 0);
  }
  if (total === 0) return 0;
  return Math.round((earned / total) * 100);
}

export interface SeoSignals {
  hasTitle: boolean;
  titleLen: number;
  hasMetaDescription: boolean;
  metaDescriptionLen: number;
  hasViewport: boolean;
  hasCanonical: boolean;
  hasLang: boolean;
  h1Count: number;
  imgWithAltRatio: number; // 0..1
  hasRobotsAllow: boolean; // false if robots meta says noindex
  linksWithTextRatio: number; // 0..1
}

export function scoreSeo(s: SeoSignals): number {
  const titleResult: CheckResult = !s.hasTitle
    ? "fail"
    : s.titleLen < 10 || s.titleLen > 70
      ? "partial"
      : "pass";
  const metaResult: CheckResult = !s.hasMetaDescription
    ? "fail"
    : s.metaDescriptionLen < 50 || s.metaDescriptionLen > 170
      ? "partial"
      : "pass";
  const h1Result: CheckResult =
    s.h1Count === 1 ? "pass" : s.h1Count === 0 ? "fail" : "partial";
  const altResult: CheckResult =
    s.imgWithAltRatio >= 0.95 ? "pass" : s.imgWithAltRatio >= 0.7 ? "partial" : "fail";
  const linkResult: CheckResult =
    s.linksWithTextRatio >= 0.95
      ? "pass"
      : s.linksWithTextRatio >= 0.8
        ? "partial"
        : "fail";

  return checklistScore([
    { id: "title", weight: 10, result: titleResult },
    { id: "meta-description", weight: 8, result: metaResult },
    { id: "viewport", weight: 8, result: s.hasViewport ? "pass" : "fail" },
    { id: "canonical", weight: 6, result: s.hasCanonical ? "pass" : "fail" },
    { id: "lang", weight: 5, result: s.hasLang ? "pass" : "fail" },
    { id: "h1", weight: 6, result: h1Result },
    { id: "img-alt", weight: 6, result: altResult },
    { id: "robots", weight: 10, result: s.hasRobotsAllow ? "pass" : "fail" },
    { id: "link-text", weight: 5, result: linkResult },
  ]);
}

export interface A11ySignals {
  imgWithAltRatio: number;
  inputsWithLabelRatio: number;
  buttonsWithNameRatio: number;
  hasLang: boolean;
  hasMainLandmark: boolean;
  headingOrderOk: boolean;
}

export function scoreA11y(s: A11ySignals): number {
  const imgR: CheckResult =
    s.imgWithAltRatio >= 0.95 ? "pass" : s.imgWithAltRatio >= 0.7 ? "partial" : "fail";
  const inputR: CheckResult =
    s.inputsWithLabelRatio >= 0.95
      ? "pass"
      : s.inputsWithLabelRatio >= 0.7
        ? "partial"
        : "fail";
  const btnR: CheckResult =
    s.buttonsWithNameRatio >= 0.95
      ? "pass"
      : s.buttonsWithNameRatio >= 0.7
        ? "partial"
        : "fail";
  return checklistScore([
    { id: "img-alt", weight: 10, result: imgR },
    { id: "form-labels", weight: 10, result: inputR },
    { id: "button-names", weight: 8, result: btnR },
    { id: "html-lang", weight: 6, result: s.hasLang ? "pass" : "fail" },
    { id: "main-landmark", weight: 5, result: s.hasMainLandmark ? "pass" : "fail" },
    { id: "heading-order", weight: 5, result: s.headingOrderOk ? "pass" : "fail" },
  ]);
}

export interface BpSignals {
  isHttps: boolean;
  hasDoctype: boolean;
  consoleErrors: number;
  imageAspectOkRatio: number;
  hasCharset: boolean;
}

export function scoreBestPractices(s: BpSignals): number {
  const consoleR: CheckResult =
    s.consoleErrors === 0 ? "pass" : s.consoleErrors <= 2 ? "partial" : "fail";
  const aspectR: CheckResult =
    s.imageAspectOkRatio >= 0.95
      ? "pass"
      : s.imageAspectOkRatio >= 0.8
        ? "partial"
        : "fail";
  return checklistScore([
    { id: "https", weight: 15, result: s.isHttps ? "pass" : "fail" },
    { id: "doctype", weight: 5, result: s.hasDoctype ? "pass" : "fail" },
    { id: "charset", weight: 5, result: s.hasCharset ? "pass" : "fail" },
    { id: "console-errors", weight: 10, result: consoleR },
    { id: "image-aspect", weight: 8, result: aspectR },
  ]);
}

// ---------------------------------------------------------------------------
// CWV → user-facing units (seconds for time, raw for CLS, ms for INP)
// ---------------------------------------------------------------------------

export function buildCwv(m: PerfMetrics & { ttfbMs: number }): CoreWebVitals {
  // INP can't be measured headlessly without scripted interaction; synthesize
  // from TBT as a rough proxy. Real PSI gets this from CrUX field data.
  const inp = Math.max(80, Math.min(600, Math.round(m.tbtMs + 100)));
  return {
    lcp: Math.round((m.lcpMs / 1000) * 100) / 100,
    cls: Math.round(m.clsValue * 1000) / 1000,
    inp,
    fcp: Math.round((m.fcpMs / 1000) * 100) / 100,
    ttfb: Math.round(m.ttfbMs),
  };
}
