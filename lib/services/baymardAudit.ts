import { v4 as uuid } from "uuid";
import type { Finding, PageType } from "../types";
import { claudeVision, hasClaudeKey, mockFindingsForPage } from "./claude";
import { BAYMARD_VISION_SYSTEM, buildBaymardUserPrompt } from "../prompts/baymardVision";
import { guidelinesFor } from "../data/baymardGuidelines";
import { readScreenshot } from "../utils/storage";

export async function baymardAudit(
  pageType: PageType,
  reportId: string | undefined,
  screenshotName: string | undefined,
): Promise<Finding[]> {
  const buf =
    reportId && screenshotName ? await readScreenshot(reportId, screenshotName) : null;
  if (!hasClaudeKey() || !buf) {
    // Filter mock findings to only the baymardUx category for variety
    return mockFindingsForPage(pageType)
      .filter((f) => f.category === "conversion" || f.category === "mobile")
      .slice(0, 1)
      .map((f) => ({ ...f, id: uuid(), category: "baymardUx" }));
  }
  try {
    const guidelines = guidelinesFor(pageType);
    const b64 = buf.toString("base64");
    const raw = await claudeVision({
      system: BAYMARD_VISION_SYSTEM,
      user: buildBaymardUserPrompt(pageType, guidelines),
      imageBase64: b64,
    });
    const fence = raw.match(/```json\s*([\s\S]*?)```/);
    const body = fence ? fence[1] : raw;
    let parsed: { findings?: Array<Record<string, unknown>> } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      const m = body.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    if (!parsed.findings) return [];
    return parsed.findings.map((f) => ({
      id: uuid(),
      pageType,
      title: String(f.title ?? f.guidelineId ?? "Baymard issue"),
      description: String(f.description ?? ""),
      severity: (f.severity as Finding["severity"]) ?? "medium",
      category: "baymardUx" as const,
      bucket: "fix-now" as const,
      recommendation: String(f.recommendation ?? ""),
    }));
  } catch (e) {
    console.error("baymardAudit failed:", (e as Error).message);
    return [];
  }
}
