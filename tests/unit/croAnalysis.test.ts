// Section A10 — prompt builders
import { describe, it, expect } from "vitest";
import {
  CRO_ANALYSIS_SYSTEM,
  FYND_ADVANTAGES_TABLE,
  buildAnalysisUserPrompt,
} from "@/lib/prompts/croAnalysis";
import { BAYMARD_VISION_SYSTEM, buildBaymardUserPrompt } from "@/lib/prompts/baymardVision";

describe("croAnalysis prompt", () => {
  it("#81 system prompt includes the verbatim Fynd advantages table", () => {
    expect(CRO_ANALYSIS_SYSTEM).toContain(FYND_ADVANTAGES_TABLE);
    // Sanity-check a few specific rows
    expect(FYND_ADVANTAGES_TABLE).toContain("sticky ATC");
    expect(FYND_ADVANTAGES_TABLE).toContain("UPI");
    expect(FYND_ADVANTAGES_TABLE).toContain("guest checkout");
  });

  it("#82 user prompt includes pageType, URL, pageSpeed, sticky, DOM scrape", () => {
    const out = buildAnalysisUserPrompt({
      pageType: "homepage",
      url: "https://x.test",
      domSnapshot: { foo: "bar" },
      pageSpeed: { mobile: { performance: 80 } },
      sticky: { header: true },
    });
    expect(out).toContain("Page type: homepage");
    expect(out).toContain("https://x.test");
    expect(out).toContain('"performance":80');
    expect(out).toContain('"header":true');
    expect(out).toContain('"foo":"bar"');
  });

  it("#83 truncates DOM scrape to 6000 chars", () => {
    const huge = "A".repeat(20000);
    const out = buildAnalysisUserPrompt({
      pageType: "homepage",
      url: "https://x",
      domSnapshot: { huge },
    });
    // Roughly: prompt body + 6000 chars of DOM scrape; total well under 20K
    expect(out.length).toBeLessThan(8000);
  });

  it("#85 sticky signals appear in the prompt body (regression guard for §5.7 wiring)", () => {
    const out = buildAnalysisUserPrompt({
      pageType: "pdp",
      url: "https://x",
      domSnapshot: {},
      sticky: { primaryCta: true, header: false },
    });
    expect(out).toMatch(/Sticky.*primaryCta/);
  });
});

describe("baymardVision prompt", () => {
  it("#84 lists all guidelines passed in", () => {
    const out = buildBaymardUserPrompt("homepage", [
      { id: "BM-1", text: "Show a search bar above the fold" },
      { id: "BM-2", text: "Include trust signals near hero" },
    ]);
    expect(out).toContain("BM-1");
    expect(out).toContain("Show a search bar above the fold");
    expect(out).toContain("BM-2");
    expect(BAYMARD_VISION_SYSTEM.length).toBeGreaterThan(50);
  });
});
