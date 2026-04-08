import type { CategoryKey, CategoryScore, Finding, PageReport, PageSpeedResult } from "../types";

// MVP weights — sum to 1.0 (5.7 deferred, redistributed)
export const WEIGHTS: Record<CategoryKey, number> = {
  performance: 0.18,
  mobile: 0.12,
  seo: 0.12,
  conversion: 0.18,
  technical: 0.12,
  baymardUx: 0.28,
};

const LABELS: Record<CategoryKey, string> = {
  performance: "Performance",
  mobile: "Mobile UX",
  seo: "SEO",
  conversion: "Conversion",
  technical: "Technical",
  baymardUx: "Baymard UX",
};

function severityPenalty(sev: Finding["severity"]) {
  switch (sev) {
    case "critical":
      return 18;
    case "high":
      return 10;
    case "medium":
      return 5;
    case "low":
      return 2;
  }
}

function avgPSI(pages: PageReport[], pick: (r: PageSpeedResult) => number): number | null {
  const nums: number[] = [];
  for (const p of pages) {
    if (p.pageSpeed?.mobile) nums.push(pick(p.pageSpeed.mobile));
    if (p.pageSpeed?.desktop) nums.push(pick(p.pageSpeed.desktop));
  }
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function scoreReport(pages: PageReport[]): {
  categoryScores: CategoryScore[];
  overall: number;
} {
  const allFindings = pages.flatMap((p) => p.findings);
  const baseByCat: Record<CategoryKey, number> = {
    performance: 100,
    mobile: 100,
    seo: 100,
    conversion: 100,
    technical: 100,
    baymardUx: 100,
  };

  // PSI-anchored categories
  const perf = avgPSI(pages, (r) => r.performance);
  const seoPSI = avgPSI(pages, (r) => r.seo);
  const a11y = avgPSI(pages, (r) => r.accessibility);
  if (perf != null) baseByCat.performance = perf;
  if (seoPSI != null) baseByCat.seo = seoPSI;
  if (a11y != null) baseByCat.mobile = (baseByCat.mobile + a11y) / 2;

  for (const f of allFindings) {
    baseByCat[f.category] = Math.max(0, baseByCat[f.category] - severityPenalty(f.severity));
  }

  const cats: CategoryScore[] = (Object.keys(WEIGHTS) as CategoryKey[]).map((k) => ({
    key: k,
    label: LABELS[k],
    score: Math.round(baseByCat[k]),
    weight: WEIGHTS[k],
  }));

  const overall = Math.round(cats.reduce((sum, c) => sum + c.score * c.weight, 0));
  return { categoryScores: cats, overall };
}
