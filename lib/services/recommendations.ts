import { v4 as uuid } from "uuid";
import type { Finding, PageType } from "../types";
import { claudeText, hasClaudeKey, mockFindingsForPage } from "./claude";
import { CRO_ANALYSIS_SYSTEM, buildAnalysisUserPrompt } from "../prompts/croAnalysis";

export interface AnalyzeInput {
  pageType: PageType;
  url: string;
  domSnapshot: unknown;
  pageSpeed?: unknown;
  sticky?: unknown;
}

export async function analyzePage(input: AnalyzeInput): Promise<Finding[]> {
  if (!hasClaudeKey()) return mockFindingsForPage(input.pageType);
  try {
    const raw = await claudeText({
      system: CRO_ANALYSIS_SYSTEM,
      user: buildAnalysisUserPrompt(input),
    });
    const json = extractJson(raw);
    if (!json || !Array.isArray(json.findings)) return mockFindingsForPage(input.pageType);
    return (json.findings as Array<Record<string, unknown>>).map((f) => ({
      id: uuid(),
      pageType: input.pageType,
      title: String(f.title ?? "Untitled"),
      description: String(f.description ?? ""),
      evidence: f.evidence ? String(f.evidence) : undefined,
      severity: (f.severity as Finding["severity"]) ?? "medium",
      category: (f.category as Finding["category"]) ?? "conversion",
      bucket: (f.bucket as Finding["bucket"]) ?? "fix-now",
      fyndAdvantage: f.fyndAdvantage ? String(f.fyndAdvantage) : undefined,
      recommendation: String(f.recommendation ?? ""),
    }));
  } catch (e) {
    console.error("analyzePage failed, using mock:", (e as Error).message);
    return mockFindingsForPage(input.pageType);
  }
}

function extractJson(text: string): { findings?: unknown[] } | null {
  if (!text) return null;
  const fence = text.match(/```json\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  try {
    return JSON.parse(body);
  } catch {
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
