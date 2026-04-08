import type { Page } from "puppeteer";
import { CATEGORY_LINK_HINTS, PRODUCT_LINK_HINTS } from "../utils/selectors";

// Spec §3.2.1 — page detection priority

export async function findCategoryUrl(page: Page): Promise<string | null> {
  return await page.evaluate((hints) => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    for (const hint of hints) {
      const m = links.find((a) => a.href.includes(hint));
      if (m) return m.href;
    }
    // Fallback: nav links with category-ish words
    const nav = links.filter((a) => {
      const t = (a.textContent || "").toLowerCase().trim();
      return /shop|men|women|new|sale|all|category|collection/i.test(t);
    });
    return nav[0]?.href || null;
  }, CATEGORY_LINK_HINTS);
}

export async function findProductUrl(page: Page): Promise<string | null> {
  const list = await findProductUrls(page, 1);
  return list[0] ?? null;
}

// Spec §3.3 — return up to N candidate PDP URLs from the current page so the
// crawler can retry across multiple products if the first one's ATC fails
// (out of stock, unsupported variant, blocked, etc.).
export async function findProductUrls(page: Page, max = 3): Promise<string[]> {
  return await page.evaluate(
    (hints, max) => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      const seen = new Set<string>();
      const out: string[] = [];
      for (const hint of hints) {
        for (const a of links) {
          if (!a.href.includes(hint)) continue;
          if (seen.has(a.href)) continue;
          seen.add(a.href);
          out.push(a.href);
          if (out.length >= max) return out;
        }
      }
      return out;
    },
    PRODUCT_LINK_HINTS,
    max,
  );
}

export async function isPdp(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    if (document.querySelector('script[type="application/ld+json"]')) {
      const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
      for (const s of Array.from(scripts)) {
        try {
          const j = JSON.parse(s.textContent || "{}");
          const t = Array.isArray(j) ? j.map((x) => x["@type"]).flat() : [j["@type"]].flat();
          if (t.some((x: string) => x === "Product")) return true;
        } catch {}
      }
    }
    if (document.querySelector('[itemtype*="Product"]')) return true;
    if (document.querySelector('button[data-action="add-to-cart"], #add-to-cart, .product-form__submit')) return true;
    return false;
  });
}

export async function findCartUrl(page: Page, base: string): Promise<string | null> {
  // Standard guesses
  const candidates = ["/cart", "/cart/", "/checkout/cart"];
  for (const c of candidates) {
    try {
      const u = new URL(c, base).toString();
      return u;
    } catch {}
  }
  return null;
}

export async function findCheckoutUrl(page: Page, base: string): Promise<string | null> {
  const guesses = ["/checkout", "/checkouts", "/cart/checkout"];
  for (const g of guesses) {
    try {
      return new URL(g, base).toString();
    } catch {}
  }
  return null;
}
