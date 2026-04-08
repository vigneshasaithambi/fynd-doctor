import type { Page } from "puppeteer";

export interface DomSnapshot {
  title: string;
  metaDescription: string;
  h1: string[];
  h2Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  hasJsonLd: boolean;
  hasOpenGraph: boolean;
  hasViewport: boolean;
  hasCanonical: boolean;
  trustSignals: {
    reviewsMention: boolean;
    secureMention: boolean;
    returnsMention: boolean;
  };
  forms: number;
  buttons: number;
  links: number;
  bodyTextSample: string;
}

export async function scrapeDom(page: Page): Promise<DomSnapshot> {
  return await page.evaluate(() => {
    const meta = (name: string) =>
      (document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null)?.content || "";
    const text = document.body?.innerText || "";
    return {
      title: document.title || "",
      metaDescription: meta("description"),
      h1: Array.from(document.querySelectorAll("h1")).map((h) => (h.textContent || "").trim()),
      h2Count: document.querySelectorAll("h2").length,
      imageCount: document.querySelectorAll("img").length,
      imagesMissingAlt: Array.from(document.querySelectorAll("img")).filter(
        (i) => !i.getAttribute("alt"),
      ).length,
      hasJsonLd: !!document.querySelector('script[type="application/ld+json"]'),
      hasOpenGraph: !!document.querySelector('meta[property^="og:"]'),
      hasViewport: !!document.querySelector('meta[name="viewport"]'),
      hasCanonical: !!document.querySelector('link[rel="canonical"]'),
      trustSignals: {
        reviewsMention: /reviews?|rated|stars?/i.test(text),
        secureMention: /secure checkout|ssl|256-bit/i.test(text),
        returnsMention: /return|refund/i.test(text),
      },
      forms: document.querySelectorAll("form").length,
      buttons: document.querySelectorAll("button").length,
      links: document.querySelectorAll("a").length,
      bodyTextSample: text.slice(0, 2000),
    };
  });
}
