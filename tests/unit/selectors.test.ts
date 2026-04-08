// Section A11 — selector + regex coverage
import { describe, it, expect } from "vitest";
import {
  ATC_SELECTORS,
  ATC_TEXT_PATTERNS,
  CART_LINK_SELECTORS,
  CHECKOUT_BUTTON_SELECTORS,
  CATEGORY_LINK_HINTS,
  PRODUCT_LINK_HINTS,
} from "@/lib/utils/selectors";

describe("ATC selector cascade", () => {
  it("includes the major Shopify selectors", () => {
    expect(ATC_SELECTORS).toContain('button[data-action="add-to-cart"]');
    expect(ATC_SELECTORS).toContain("button.product-form__submit");
  });

  it("ATC_TEXT_PATTERNS catches all common phrasings", () => {
    const phrases = ["Add to Cart", "Add to Bag", "BUY NOW", "Add to Basket"];
    for (const p of phrases) {
      expect(ATC_TEXT_PATTERNS.some((re) => re.test(p))).toBe(true);
    }
  });
});

describe("Category + product link hints", () => {
  it("CATEGORY_LINK_HINTS covers common e-commerce paths", () => {
    expect(CATEGORY_LINK_HINTS).toContain("/collections/");
    expect(CATEGORY_LINK_HINTS).toContain("/category/");
    expect(CATEGORY_LINK_HINTS).toContain("/shop/");
  });

  it("PRODUCT_LINK_HINTS covers common PDP paths", () => {
    expect(PRODUCT_LINK_HINTS).toContain("/products/");
    expect(PRODUCT_LINK_HINTS).toContain("/p/");
    expect(PRODUCT_LINK_HINTS).toContain("/dp/");
  });
});

describe("Cart + checkout selectors", () => {
  it("cart selectors include hash-anchor + class fallbacks", () => {
    expect(CART_LINK_SELECTORS.length).toBeGreaterThan(0);
  });

  it("checkout selectors include button[name=checkout]", () => {
    expect(CHECKOUT_BUTTON_SELECTORS).toContain('button[name="checkout"]');
  });
});

// G181 — regression guard for the bundler-safe string pattern.
// If anyone "refactors" these to functions, the page.evaluate() will trip on
// `__name is not defined` (see docs/BUG_FIXES.md #1).
describe("page.evaluate() bundler-safe string regression guard", () => {
  it("OBSERVER_BOOTSTRAP is a string, not a function", async () => {
    const { OBSERVER_BOOTSTRAP } = await import("@/lib/services/lighthouseLite/observer");
    expect(typeof OBSERVER_BOOTSTRAP).toBe("string");
    expect(OBSERVER_BOOTSTRAP.length).toBeGreaterThan(100);
  });

  it("SCRAPE_JS is a string, not a function", async () => {
    const { SCRAPE_JS } = await import("@/lib/services/lighthouseLite/scrape");
    expect(typeof SCRAPE_JS).toBe("string");
  });

  it("STICKY_JS is a string, not a function", async () => {
    // Not directly exported — we re-import the module file and read its source.
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib", "crawler", "stickyDetector.ts"),
      "utf8",
    );
    expect(src).toMatch(/const STICKY_JS\s*=\s*`/);
  });
});

// G182 — serverExternalPackages regression guard for puppeteer-extra plugins
// (see docs/BUG_FIXES.md #2). If a future plugin gets added without
// externalising, Next will break with `utils.typeOf is not a function`.
describe("next.config.ts serverExternalPackages regression guard", () => {
  it("includes puppeteer-extra and the stealth plugin", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "next.config.ts"),
      "utf8",
    );
    expect(src).toContain("serverExternalPackages");
    expect(src).toContain("puppeteer-extra");
    expect(src).toContain("puppeteer-extra-plugin-stealth");
  });
});
