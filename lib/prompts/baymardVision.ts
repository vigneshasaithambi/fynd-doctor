import type { Guideline } from "../data/baymardGuidelines";

export const BAYMARD_VISION_SYSTEM = `You are a UX research analyst trained on Baymard Institute e-commerce usability guidelines. You will be shown a screenshot of one page of an e-commerce site, plus a list of guidelines that apply to that page type. For each guideline, judge whether the page passes, partially passes, or fails. For every fail or partial, return a Finding.

Output JSON only: { "findings": [ { "guidelineId": string, "title": string, "description": string, "severity": "critical|high|medium|low", "recommendation": string } ] }`;

export function buildBaymardUserPrompt(pageType: string, guidelines: Guideline[]) {
  return `Page type: ${pageType}
Guidelines to evaluate:
${guidelines.map((g) => `- [${g.id}] ${g.text}`).join("\n")}

Look at the screenshot and return any failed or partially-met guidelines.`;
}
